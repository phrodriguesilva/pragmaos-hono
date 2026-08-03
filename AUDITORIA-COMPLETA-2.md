# Auditoria Completa — PragmaOS 2 (Rodada 2 / Pós-correção)

**Data:** 2026-08-02
**Contexto:** Rodada 1 em `AUDITORIA-COMPLETA.md`. Desde então houve o commit **`81e4c2e` — "security: P0+P1 fixes — RLS escalation, IDOR, XSS, auth, RBAC, migrations"** (21 arquivos, +497/−35), alegando corrigir os pontos P0/P1/P2 da rodada 1.
**Escopo desta rodada:** (a) re-verificação da base; (b) auditoria da **qualidade e completude das correções**; (c) **regressões introduzidas pelas correções**; (d) gaps remanescentes. Nenhum arquivo foi modificado.

---

## 0. Re-verificação da base (executada)

| Checagem | Comando | Resultado |
|---|---|---|
| Typecheck | `bun run typecheck` | ✅ PASS |
| Testes | `bun test` | ✅ 91 pass / 0 fail |
| Build produção | `bun run build` | ✅ Sucesso (420 módulos, bundle 4.13 MB) |

> **Ainda não há testes novos.** O commit de segurança **não adicionou nenhum caso de teste** (nada em `tests/` sobre `tenant-ownership`, `2fa/disable`, escalada, etc.). Continuam sem teste: integração HTTP/Hono (0), `session`, `tenant-resolver`, `sanitize`, `api-auth`, `env`, `subscription`.

---

## 1. Veredito resumido

### ✅ Correções aplicadas de forma correta e eficaz

1. **[P0 RLS] Escalada de privilégio em `profiles` — CORRIGIDO.** `0031` cria o trigger `protect_profile_privileges()` (`BEFORE UPDATE`) que bloqueia, para usuários **não-platform-admin**, alteração de `is_platform_admin`, `tenant_id`, e `role` (role só por sócios). Writes via **service role** (sem `auth.uid()`) não disparam a checagem — correto, o back-office continua funcionando. ✅
2. **[RLS] Vazamento cross-tenant em `consultas` — CORRIGIDO.** `0031` troca `current_setting('app.tenant_id')` por `current_tenant_id()` em `consultas`, `consulta_credits`, `consulta_batches`. Quem não tem perfil recebe NULL → nega por padrão. ✅
3. **[RLS] `notify_tenant`/`notify_user` — CORRIGIDO.** `revoke execute from public` + `set search_path = public`. ✅
4. **[XSS] `editor.tsx` — CORRIGIDO.** Usa agora o `sanitizeHtml` compartilhado de `lib/sanitize.ts` (removida a regex própria frágil). ✅
5. **[XSS] `EditModal` (`ui.tsx`) — CORRIGIDO.** `editModalOpen` sanitiza inline antes do `x-html`: remove `<script>`, atributos `on*` e `href javascript:`. Conteúdo vem de formulário próprio (defense-in-depth). ✅ (ainda recomendo sanitizer único no servidor, mas o vetor principal está fechado.)
6. **[Injeção CSS] `public-layout.tsx` — CORRIGIDO.** `safeColor()` valida `^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$` antes de interpolar. ✅
7. **[Auth] Troca de senha — CORRIGIDO** (ver alerta em §3.2 sobre o client usado).
8. **[Auth] Desativar 2FA — CORRIGIDO.** `POST /2fa/disable` exige `totp_code` válido via `validateTOTP`. O `secret` é lido cru; o "enable" também o grava cru — fluxo consistente, validação bate. ✅
9. **[RBAC] `requireRole` bem aplicado.** Além das 6 rotas citadas no commit, o diff adicionou `requireRole` em **muito mais** rotas (billing, finance, finance-reports, trust-accounts, jurimetry, permissions, api-keys, users, audit, teams, onboarding, docs, site-admin, company-settings, import, cashflow). Boa cobertura financeira/admin. ✅
10. **[IDOR] Ownership validado em 8 rotas** via helper `tenant-ownership.ts` (`case/client/proceeding/document/task/profile/honorario BelongsToTenant`): hearings, deadlines, proceedings, communications, documents, tasks, honorarios, timesheet. ✅ (parcial — ver §3.)

---

## 2. Regressões / defeitos introduzidos pelas correções (NOVOS)

### 🔴 2.1 QUEBRA FUNCIONAL — Migração `team_members` (0032)

- `0032` renomeia a tabela **interna** `team_members` (de `0015`: times de usuários, colunas `team_id/user_id/role`) para `team_members_internal` e cria uma **nova** `team_members` com colunas da página **pública** (`public_name`, `slug`, `profile_id`, …).
- **Problema:** o código de **times internos** `teams.tsx` (linhas 55, 194, 351, 367) **continua consultando/gravando `team_members`** — que agora é a tabela **pública**, sem colunas `team_id`/`user_id`/`role`. Resultado: **a funcionalidade de times internos está quebrada** em runtime (queries/inserts falham ou gravam dados no lugar errado).
- **Nenhum código usa `team_members_internal`** (grep em `src/` → vazio), confirmando a regressão.
- **Correção necessária:** atualizar `teams.tsx` para `team_members_internal` (e o helper de ownership), **ou** reverter a nomenclatura: manter `team_members` para a interna e renomear a pública (ex.: `public_team_members`), ajustando `site-admin.tsx`/`public-site.tsx` que consomem a pública.

### 🟠 2.2 Migration `0032` NÃO corrige instalação limpa (fresh install)

- O problema original: `0005` faz `ALTER TABLE integrations` (tabela só existe em `0006`) e `0014` referencia `honorarios` (criada em `0015`) com `language sql` (valida no create) — em DB limpo **ambos abortam**.
- `0032` **não resolve isso**: é uma migration **adicional** que roda **depois** de `0030`/`0031`. Como migrations são aplicadas em ordem e **param no primeiro erro**, um DB limpo nunca chega em `0032` — trava em `0005`.
- **Correção real:** editar `0005` (tornar o ALTER tolerante/`if exists` ou mover para depois de `0006`) e `0014` (criar funções após `0015`, ou usar `language plpgsql` com corpo `stable`). `0032` só vale para DBs já migrados.

### 🟠 2.3 Troca de senha usa client com service role

- `profile.tsx` chama `supabase.auth.signInWithPassword({ email: user.email, password: currentPassword })` no client **service role** (`lib/supabase.ts`).
- O endpoint de senha do GoTrue normalmente é chamado com a **anon key** como `apikey`. Usar a **service-role key** como `apikey` no `/auth/v1/token` pode ser rejeitado (401) → o `verifyError` dispara e o usuário legítimo não consegue trocar a senha. **(Fluxo pode estar quebrado em produção.)** Verificar com teste real; se falhar, criar um client anon dedicado (como `session.ts` faz para `getUser`).
- Nota adicional: `signInWithPassword` também dispara políticas de rate-limit do GoTrue (sem problema) e não armazena sessão (client sem persistência — ok).

---

## 3. Gaps remanescentes (rodada 1) NÃO tocados pelo commit

### 🔴 3.1 IDOR / vazamento entre tenants — AINDA ABERTO em rotas severas

O commit corrigiu 8 rotas, mas as seguintes **continuam sem validação de ownership** (verificado por grep — nenhum uso de `BelongsToTenant`):

| Rota | Situação | Severidade |
|---|---|---|
| **`workflows.tsx`** `POST /:id/execute` | Insere em `tasks`, `deadlines`, `honorarios`, `communications_log` usando `case_id`/`client_id`/`assigned_to` do JSON `action_config` **sem validação** | 🔴 Multi-tenant write + writes inválidos (ex.: `honorario` com `type:"fee"` que não existe no enum) |
| **`messages.tsx`** `POST /:id/messages`, `/:id/members`, `/:id/members/:m/remove` | Não valida canal/tenant/membership → postar/remover em canal de **outro tenant** | 🔴 |
| **`signatures.tsx`** `send-to-clicksign`/`send-to-docusign` | Busca `documents` por `document_id` **sem `.eq(tenant_id)`** (L450-454, L555-559) → vazar título/URL de doc de outro tenant | 🟠 |
| **`billing.tsx`** | `client_id`/`case_id`/`honorario_id` do body não verificados (agora role-gated, mas IDOR ainda possível por sócio/financeiro) | 🟠 |
| **`cashflow.tsx`** | `POST /expenses` aceita `case_id` sem ownership | 🟠 |
| **`finance.tsx`** | invoice `case_id` não verificado | 🟠 |
| **`companies.tsx`** | `POST /:id/representatives` insere `company_id` sem validar tenant | 🟠 |
| **`permissions.tsx`** | `POST /:id` vincula `role_id` sem validar tenant da role | 🟠 |
| **`teams.tsx`** | `POST /:id/members` aceita `user_id` sem confirmar que pertence ao tenant | 🟠 |

### 🟠 3.2 Demais itens da rodada 1 ainda pendentes

- **`ENCRYPTION_KEY`** — continua **fora** do schema `env.ts` e ausente do `.env.local`; `crypto.ts` cai para chave de dev determinística fora de produção e lança em produção. (Não tocado.)
- **Vazamento de `error.message` ao usuário** — `clients`, `templates`, `proceedings`, `api`, `api-keys`, `calendar`, `diario-oficial`, `intimacoes`, `trust-accounts`, `consultas` seguem ecoando erros internos. (Não tocado.)
- **Webhooks** — idempotência **não** resolvida: `whatsapp-webhook.ts` faz insert de inbound (L147) **sem dedupe** por `external_message_id` (o `.eq` na L188 é só do status update); `signature-webhooks.ts` re-insere logs e re-aplica updates em retries (parcial). Rate limit em webhooks e `/intake-public` continua ausente (intake público sem CAPTCHA/honeypot).
- **PII→IA** — `ai-chat.tsx`/`cases.tsx` seguem enviando CPF/CNPJ/email/telefone do cliente ao LLM externo; logs guardam `input_text`/`output_text` integral. (Não tocado.)
- **Multi-write sem transação** — `users`, `cases`, `workflows` executam sequências sem atomicidade. (Não tocado.)
- **Hard delete** em `documents` (vs soft-delete no resto). (Não tocado.)
- **Segredos em plaintext** em `integrations.tsx` (`config` com API keys/client_secret/app_secret). (Não tocado.)
- **Catálogo de planos duplicado** entre `marketing.tsx` e `subscription.tsx`. (Não tocado.)
- **Rate limit / captcha** em `signup` existe (bom), mas `intake-public` e webhooks não têm.
- **`oauth.ts`** — verificar se a lógica com a service-role key fica fora do bundle client (não foi mexida; risco mantido se algum dia for importada em browser).
- **Rotação do token Upstash** (vazado em histórico) — ação operacional, não resolvida por código.

---

## 4. Veredito por área

| Área | Rodada 1 | Rodada 2 |
|---|---|---|
| Build / typecheck / testes | ✅ | ✅ (sem testes novos) |
| RLS / escalada de privilégio | 🔴 | ✅ corrigido (mas ver regressão team_members em migrações) |
| Vazamento cross-tenant consultas | 🔴 | ✅ corrigido |
| XSS (editor/EditModal/CSS) | 🔴 | ✅ corrigido |
| Auth (senha/2FA) | 🟠 | ✅ corrigido (ver alerta do client service-role) |
| RBAC em rotas sensíveis | 🟠 | ✅ bem expandido |
| IDOR (ownership) | 🔴 | 🟠 parcial — 8/17 rotas; **workflows/messages/signatures/billing/cashflow/finance/companies/permissions/teams abertos** |
| Migrations ordem fresh install | 🔴 | 🟠 **não resolvido** (0032 inócuo em fresh) + regressão `team_members` |
| Webhooks idempotência/rate | 🟠 | ❌ não tocado |
| PII→IA / error.message | 🟠 | ❌ não tocado |
| ENCRYPTION_KEY / env | 🟠 | ❌ não tocado |
| Transações / hard delete | 🟠 | ❌ não tocado |
| Integrações plaintext | 🟠 | ❌ não tocado |
| Testes de segurança | 🟠 | ❌ nenhum teste novo |

---

## 5. Prioridade de correção para a próxima rodada

1. **P0 — Corrigir a regressão `team_members`** (decisão de nomenclatura + atualizar `teams.tsx` e consumidores).
2. **P0 — Fazer `0005`/`0014` funcionarem em fresh install** (editar as migrations em lugar de adicionar `0032`).
3. **P1 — Validar/fluxos de login service-role** na troca de senha (`profile.tsx`).
4. **P1 — IDOR restante:** `workflows execute`, `messages`, `signatures`, `billing`, `cashflow`, `finance`, `companies`, `permissions`, `teams` (usar `tenant-ownership.ts`).
5. **P1 — Idempotência + rate limit** em webhooks e `/intake-public` (CAPTCHA/honeypot).
6. **P1 — `ENCRYPTION_KEY`** no `env.ts` + falhar em produção; rotar token Upstash.
7. **P2 —** parar de expor `error.message`; mascarar PII em IA/logs; transações em multi-writes; soft-delete em documents; criptografar `config` de integrações; deduplicar catálogo de planos.
8. **P3 —** testes de segurança (sessão, tenant-resolver, sanitize, ownership, RLS), integração HTTP; i18n; a11y; tokens de cor; deduplicar `<head>`/CSS; paginação/N+1.

---

*Documento de auditoria (leitura estática completa: diff `81e4c2e`, rotas, núcleo, migrations 0030–0032, componentes). Nenhum arquivo foi modificado.*
