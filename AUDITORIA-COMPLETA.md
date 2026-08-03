# Auditoria Completa — PragmaOS 2

**Data:** 2026-08-02
**Escopo:** 100% do sistema — núcleo/back-end, todas as 62+ rotas, camada de apresentação (layouts, componentes, UI), banco de dados (30 migrations + RLS), testes e infraestrutura de deploy.
**Stack:** Bun + Hono + TypeScript (TSX server-rendered) + Supabase (Postgres) + Tailwind v4 + Alpine.js + Vercel.

---

## 0. Estado de saneamento da base (verificação executada)

| Checagem | Comando | Resultado |
|---|---|---|
| Typecheck | `bun run typecheck` (tsc --noEmit) | ✅ PASS (0 erros) |
| Testes unitários | `bun test` | ✅ 91 pass / 0 fail (12 arquivos) |
| Build de produção | `bun run build` | ✅ Sucesso (bundle 4.12 MB, 419 módulos, CSS inlined) |

✅ **Build, typecheck e testes passam.** Todos os problemas abaixo são de **segurança, consistência, robustez e desempenho** — não de compilação.

---

## 1. CONTE OS DE PRIORIDADE (resumo executivo)

### 🔴 P0 — Crítico (escalada de privilégio / vazamento de dados / segredo comprometido)

1. **[RLS] Escalada de privilégio total via `profiles`.** A policy `profiles_tenant_isolation_modify` (`0002`) permite `UPDATE` por qualquer usuário do tenant **sem restrição de colunas**. Um usuário pode setar `is_platform_admin = true` e virar **superadmin da plataforma**, ganhando leitura/update de **todos os tenants** (via policies `0027`/`0030`). Também permite promover `role = 'sócio'`.
2. **[RLS] Vazamento multi-tenant em `consultas`** — políticas de `consultas`, `consulta_credits`, `consulta_batches` (`0028`) usam `current_setting('app.tenant_id')` (GUC controlável pelo cliente) em vez de `current_tenant_id()` → ler/consumir créditos de outro tenant.
3. **[Segredo] Chave de serviço do Supabase usada como HMAC secret** em `oauth.ts` — se essa lógica for para bundle público, expõe a service-role key (que hoje é cryptada, mas a **SUPABASE_SERVICE_ROLE_KEY** está em `SUPABASE_SERVICE_ROLE_KEY` — Nunca deve ir pro client).
4. **[Segredo vazado no histórico] Token do Upstash** commitado dentro de `src/generated/bundle.js` (commit `1f07783` e adjacentes, alcançável de `main`). `.env.local` **não** foi versionado (OK), mas o token do Redis **já vazou em histórico** → **rotacionar no Upstash**.
5. **[XSS] Editor de conteúdo** (`editor.tsx`) define um `sanitizeHtml` com regex **própria/frágil** duplicada da `lib/sanitize.ts`, que **não bloqueia** `srcdoc`, atributos `on*`, nem falsificações de `javascript:`/`data:` encobertas → XSS armazenado em conteúdo de docs/artigos.
6. **[XSS] `EditModal` (`ui.tsx`)** injeta HTML vindo de **fetch** via `x-html` **sem sanitização** → vetor de XSS se a rota devolver conteúdo de usuário.
7. **[Injeção CSS] `public-layout.tsx`** interpola `primary`/`secondary` do tenant em `<style>` **sem validar** → injeção de CSS (e possíveis quebras).

### 🟠 P1 — Alto (autenticação/account, autorização de escopo, IDOR)

8. **[Auth] Troca de senha sem verificar a senha atual** — `POST /profile/password` chama `supabase.auth.updateUser({ password })` **sem** validar `current_password`.
9. **[Auth] Desativar 2FA sem reautenticação** — `POST /profile/2fa/disable` remove a proteção **sem** exigir TOTP/senha atual.
10. **[Tenant] Chamadas sem checagem de pertença ao tenant (IDOR)** em **muitas** rotas: campos `case_id`/`client_id`/`task_id`/`document_id`/`assigned_to`/`honorario_id` são gravados do body **sem verificar que pertencem ao tenant**, e os `select`/joins `cases(title)`, `clients(name)`, `profiles(full_name)` **não filtram por tenant** → vazar título/numar de processo, nome de cliente, nome de perfil de **outros tenants**. Rotas afetadas: `hearings`, `deadlines`, `proceedings`, `communications`, `documents`, `tasks`, `finance`/`billing`, `honorarios`, `timesheet`, `workflows`, `signatures`, `cashflow`, `companies`, `teams`, `permissions`, `messages`.
   - **Concretos:** `hearings.tsx L134–148` (cria audiência com case de outro tenant); `workflows.tsx L660–717` (executa ações escrevendo tarefas/prazos/honorários com IDs arbitrários); `messages.tsx` `POST /:id/messages`, `/:id/members`, `/:id/members/:member/remove` **sem validar channel/tenant/membership**.
12. **[Webhooks] Sem idempotência** — `whatsapp-webhook.ts` e `signature-webhooks.ts` não deduplicam por `external_message_id`/`envelope_id` → retries criam eventos duplicados e estado inconsistente.
13. **[Multi-tenant em webhook]** `whatsapp-webhook.ts` busca integração via `.limit(100)` sem paginação → falha com >100 tenants.
14. **[RBAC] Rotas sensíveis sem `requireRole`** — qualquer usuário autenticado (estagiário/recepção) pode: enviar WhatsApp/email em massiva como a conta do tenant (`whatsapp.tsx`/`email.tsx`), manipular integrações/segredos (`integrations.tsx`), gerar IA com custo (`ai-chat`, `ai-summaries`), mexer em despesas/contas/honorários (`cashflow` — contrasta com `finance`/`billing` que usam role).
15. **[Webhooks públicos] Sem rate limit e depender] — `/webhooks/whatsapp`, `/webhooks/signatures/*` verificam HMAC (bom) mas não têm limitação de burst.

### 🟡 P2 — Médio (robustez, PII, consistência, performance)

16. **[PII→IA] `cases.tsx` / `ai-chat.tsx` enviam CPF/CNPJ/email/telefone do cliente para o provedor de LLM externo** sem mascaramento e **logs guardam `input_text`/`output_text` integral**.
17. **[PII]** `reports.tsx` exporta CSV com `email`/`telefone` de clientes a qualquer usuário autenticado; `communications.message_body`, `proceedings.movement_text`, `recentMovements` do dashboard expostos a todo o tenant.
18. **[Erro→Usuário]** Vários handlers vazam `error.message` (schema/PG/API externa) para o cliente: `clients.tsx:188`, `templates.tsx:163`, `proceedings.tsx:210`, `api.ts`, `api-keys.ts`, `consultas.tsx`, `calendar.tsx`, `diario-oficial.tsx`, `intimacoes.tsx`, `trust-accounts.tsx`.
19. **[Atomicidade]** Múltiplos multi-writes sem transação: `users.tsx` (invite+profile+audit → usuário órfão), `cases.tsx` (case+cond ضبط), `workflows.tsx` (exec + N updates de steps), `signatures` (envio externo + update local). Risco de estados parciais.
20. **[Datas inválidas]**`new Date(...).toISOString()` sem validação de formato em `hearings`, `deadlines`, `communications` → 500 com input malformado.
21. **[NaN finance.]** `finance.tsx` `Number(undefined)` no amount → NaN e redirect silencioso.
22. **[Hard delete]** `documents.tsx:486` faz **hard delete** enquanto o resto usa soft-delete → inconsistência de auditoria/backup.
23. **[Catálogo duplicado]** `PLANS`/`PLAN_INFO` espelhado entre `marketing.tsx` e `subscription.tsx` → risco de divergência de preços.
24. **[Integrações: segredos em plaintext]** `integrations.tsx` armazena API keys / `client_secret` / `app_secret` em JSON `config` **texto puro** no DB (apenas `oauth` tokens usa `encrypt()`).
25. **[CSRF]** `requireRole` do `profile` password e do 2FA não exige reauth (já em #8/#9); middleware CSRF usa `origin ?? referer` — referer é menos confiável; e não há fallback/token em form (HTML-only).

### 🟢 P3 — Baixo / Melhoria (a11y, padrões, i18n, docs)

26. **[i18n]** PT-BR hardcoded em todo componente (defaults "Salvando...", "Nenhum registro encontrado", "Pagina anterior / Proxima pagina" — com acento inconsistente). Sem infra i18n.
27. **[A11y]** Modais `WizardModal`/`EditModal` sem trap de foco/restauração (só `Modal` tem); botões só-ícone sem `aria-label`; tabelas sem `scope`/`caption`; `ComboBox` sem `aria-controls`/`aria-activedescendant`; menus de notificação/usuário sem gestão de foco; trigger de `Modal` sem `aria-controls`/`aria-expanded`.
28. **[Tokens]** Hex hardcoded fora do design-system em `ui.tsx`, `icons.tsx`, `editor.tsx`, `marketing-layout`, `public-layout` (#0568ff, #4d8bff, #23.., #4b5470, #e6efff); tokens `carvao-600/700/800` colapsados no **mesmo** valor; escala `terracota` renomeada para azul/ouro (nome enganoso).
29. **[Perf]** `appCss + @font-face` inline **duplicado** em toda página (base/auth/marketing/public); scripts de scroll-reveal/stat-counters implementados **2x**; dashboard roda 9 queries no load; `reports`/`finance` fazem `select` total sem paginação e N+1 (loops de COUNT).
30. **[Semântica]** Múltiplos `<h1>` em `portal`, `public-site`, `onboarding`, `marketing`, `auth`, `oauth`, `intake-public`.
31. **[Reader/README desatualizados]** README lista arquivos que não existem mais (`src/index.tsx`, `serve.ts`, etc.); DEPLOY.md não menciona `ENCRYPTION_KEY`. Sem cron de deploy configurado (`deploy.yml` só manual).

---

## 2. Auditoria de Banco de Dados (Supabase / Migrations / RLS)

### 2.1 Migrations — bugs de ordem (aplicação *fresh* quebra)

| Migração | Problema |
|---|---|
| `0005` | `ALTER TABLE public.integrations ...` mas `integrations` **só é criada em `0006`** → em DB limpo aborta e nunca chega nas seguintes. |
| `0014` | Funções `dashboard_*` referenciam `honorarios`, criada só em `0015` → `language sql` valida corpo na criação e aborta. |
| `0015` vs `0023` | **Colisão de tabela `team_members`**: `0015` cria interna (times de usuários) e `0023` cria pública (página /equipe) — como `0015` roda antes, o `if not exists` do `0023` é no-op e **o site público de equipe nunca tem** `profile_id`/`public_name`/`slug` que o código espera, aplicando policies na tabela errada. |
| `0020` | Cria `integrations_tenant_type_unique` duplicado com `idx_integrations_tenant_type` (não-unique) — ineficiência não-fatal. |

### 2.2 RLS — tabelas sem RLS ou policies perigosas

| Tabela / Policy | Problema |
|---|---|
| **`profiles` / `profiles_tenant_isolation_modify`** | 🔴 `for all` sem role → **escalada a platform admin** (P0-1). |
| **`consultas`/`consulta_credits`/`consulta_batches`** | 🔴 `current_setting('app.tenant_id')` → vazamento cross-tenant (P0-2). |
| `auth_logs` / `password_resets` (insert `with check true`) | 🟠 qualquer autenticado força auditoria/tokens de reset. |
| `notify_tenant`/`notify_user` (`0017`) | 🟠 `security definer` sem `set search_path` + `EXECUTE PUBLIC` → bypass de RLS ao inserir notificações. |
| `consulta_types` (`0028`) | 🟢 sem RLS (documentado como catálogo). |
| `law_areas`, `plans` | 🟢 `using(true)` (catálogo — aceito). |

> **Ponto positivo:** as policies por tenant usam `current_tenant_id()` (des da tabela `profiles` do `auth.uid()`) na maioria das tabelas — correto e consistente, exceto as exceções acima.

### 2.3 Índices / Constraints / Funções

- Falta índice em `tenants.slug/subdomain` além do unique; `communications_log` (metadata/external_id), `signature_webhooks.envelope_id`, `tenants` ok.
- **FK soltas (orphan)**: `contact_submissions.lead_id` é `uuid` sem FK para `leads`; `ai_summaries.target_id`/`workflow_executions.entity_id` polimórficos sem validá-los.
- `current_tenant_id` retorna NULL se não há perfil → policies negam por padrão (correto; defesa de default).
- Triggers `BEFORE UPDATE` setam `updated_at` — sem recursão, porém **helpers duplicados** (`set_updated_at`/`update_updated_at`).
- **Sem credenciais/password nos seeds** — só `law_areas`/`plans`/`consulta_types` públicos. OK.

---

## 3. Auditoria de núcleo (auth, sessão, cripto, rate limit, SANITIZE)

- **[Crítico]** `ENCRYPTION_KEY` **não está no schema `env.ts`** (não validada). `.env.local` num‑local **não define**; `crypto.ts` cai para **chave de dev determinística** fora de produção e **lança em produção**. Comentário pede que `env.ts` force. → Deploy sem `ENCRYPTION_KEY` no Vercel queima rotas que criptografam.
- **[Crítico]** `env.ts` faz `safeParse` mas **continua com fallbacks parciais em vez de falhar** — variáveis críticas ausentes só quebram em runtime nas rotas que usam. (`note` intencional comentado, porém aumenta superfície de 500 seco).
- **`session.ts`** — `getSessionUser()` valida o JWT via `auth.auth.getUser(token)` (bom — não é decode local); `requireRole` só fortalece user/audit/finance; `blockPlatformAdmin` correto; `requireActiveTenant` com bypass paths OK. **Nenhum teste de session.**
- **CSRF (`csrf.ts`)** — base em Origin/Referer, skip `/api` e `/webhooks`, dev ok, vercel preview ok. **Dep de "referer" como fallback** (mais fraco que origin). Sem token duplo.
- **Rate limit** — `in-memory Map` fallback (fraco em serverless multi-instância, verissimo Upstash) e **fail‑open** quando Upstash falha. Aplicado em login/signup/profile/2fa/reset, **não** em webhooks.
- **Sanitização** — `sanitize.ts` regex-local, remove script/style/iframe, whitelist de tags/attr/URL; **robusto o suficiente para o caso**, mas **dois sanitizadores diferentes** no código (`editor.tsx` próprio) e `src/index.max` do (document). 
- **Crypto** — AES-256-GCM, IV 12B, tag, base64, backward-compat plaintext. **Implementação ok.** O risco é o fallback de chave dev.

---

## 4. Auditoria de testes (cobertura)

| Arquivo de teste | Cobertura | Observações |
|---|---|---|
| `crypto`, `export`, `prazos`, `totp` | **boa (módulo real)** | round-trip, validações. |
| `conflict`, `csv-parser` | ⚠️ **re‑implementam lógica inline** | se o módulo mudar, teste passa mesmo — duplicação "dead"). |
| `csrf` | ⚠️ **não testa o middleware real** | só testa um `array.includes` + TOTP duplicado. |
| `flash` | ⚠️ testa `JSON.parse` nativo, **não** `flash.ts`. |
| `logger`, `sentry` | ⚠️ smoke tests | `sentry` acoplado ao env (SENTRY_DSN do CI quebra teste). |
| `rate-limit` | ⚠️ teste de `Retry-After` é **vazio/no-op**; não testa Upstash / fail-open. |

**Orfãos críticos sem teste:** `session.ts`, `tenant-resolver.ts`, `sanitize.ts`, `env.ts`, `api-auth.ts`, `subscription.ts`, `supabase.ts`, e **TODAS as rotas** — **0 teste de integração HTTP/Hono** (nenhum `app.fetch` em `tests/`). Cobertura de segurança ≈ 0% no HTTP. **Bellissimo opportunity.**

---

## 5. Auditoria de infra / deploy

- **`vercel.json`**: só build + cacheHeaders de estáticos. **Sem `rewrites`, sem cron** — módulos que precisam de agendamento (diario-oficial/intimacoes) não têm job.
- **`.env.local` NÃO versionado** ✓ (nem chave do Supabase no git).
- **`.env.example`** completo e bom; **mas lista `ENCRYPTION_KEY` como "required in production"**.
- **`.env.local` local contém** service_role (com **key real**), anon, Upstash — **nunca foi commitado** ✓.
- **`scripts/seed.ts`**: default de senha `Mudar123!` + CNPJ dummy `00000000000000` → **risco de usuário real com senha fraca** se rodado sem `SEED_USER_PASSWORD`; **log imprime email/senha**.
- **`scripts/build.ts`/`gen-css`**: dependem de `bunx tailwind` (assumem raiz). `build.ts` cancela por env.
- **CI**: `ci.yml` (typecheck/test/build) ok; **`deploy.yml` só `workflow_dispatch`** (não é deploy-auto no push).
- **README desatualizado; DEPLOY.md omite `ENCRYPTION_KEY`** da lista de env obrigatória.

---

## 6. Stubs / features não implementadas (gaps funcionais)

Estes **não são bugs** mas funcionalidade anunciada/pelas rotas que **não está de fato implementada**:

- `leads.tsx` — conversão lead → cliente **não implementada** (comentário "If converting to client, we could auto-create a client record" — placeholder).
- `workflows.tsx` — actions `send_email`, `send_whatsapp`, `create_document`, `create_hearing`, `update_case` **não implementadas (stub)**; `honorario` com `type:"fee"` inválido (enum é `contratual/...`).
- `financial-reports.tsx` — `cost/ratePerMinute = 250` **hardcoded** (não configurável).
- `consultas.tsx` / `proactive.tsx` — gated por `isBigDataConfigured` → **stubs/desabilitadas** se BigData não configurada.
- `intake-public.tsx` — público **sem CAPTCHA/rate-limit** + interpolação `field.placeholder`/`field.id` sem sanitizar (risco XSS + spam).
- `docs.tsx` — doc **auto-gerada** de `generated/docs`.
- `site`, `onboarding` — convite de email do passo equipe parcialmente/stub.

---

## 7. Lista de correções recomendadas (NÃO aplicadas — apenas para referência/conhecimento)

> **O usuário pediu que nenhuma alteração seja feita — abaixo só a lista de correção prevista para priorização futura.**

**P0 (corrigir primeiro):**
1. RLS: `profiles_tenant_isolation_modify` — add check de função (`role/policy`) e **bloquear update de `is_platform_admin`, `role`, `tenant_id`**; usar `SECURITY INVOKER`/trigger `BEFORE UPDATE`. *(SQL migration)*
2. RLS `consultas*`: trocar `current_setting('app.tenant_id')` por `current_tenant_id()`.
3. Revogar `EXECUTE PUBLIC` + `set search_path` em `notify_tenant`/`notify_user`.
4. **Rotar token Upstash** (vazou em histórico). Remover `bundle.js` do git (filter-repo / ignore).
5. `editor.tsx` e `ui.tsx` (EditModal `x-html`): **usar um único sanitizador robusto** (ou DOMPurify) em todos os render joins; validar cores de tenant do `public-layout`.
6. `oauth.ts`: nunca usar `SUPABASE_SERVICE_ROLE_KEY` como HMAC/secret fora do server (remover do bundle client).

**Auth/IDOR:**
7. `profile.tsx` `POST /password`: **verificar `current_password`** (signInWithPassword/ree-authenticate) antes de alterar.
8. `profile.tsx` `POST /2fa/disable`: **exigir TOTP/senha atual**.
9. `hearings`, `deadlines`, `proceedings`, `communications`, `documents`, `tasks`, `finance`, `honorarios`, `timesheet`, `workflows`, `signatures`, `cashflow`, `companies`, `teams`, `permissions`, `messages`, `billing`, `contract`: **validar ownership de todo `case_id`/`client_id`/`task_id`/`document_id`/`assigned_to` contra o tenant** (subconsulta de pertença) e **filtrar joins por tenant**.
10. Adicionar `requireRole` em `whatsapp`(send/bulk), `emails`, `integrations`, `ai-chat`, `ai-summaries`, `cashflow` financeiro. os de acordo com o plano de permissões.
11. **Idempotência webhooks** (dedupe por `external_id`/`envelope_id`); rate limit nos webhooks e `/intake-public`.
12. `api-keys.tsx` interpolação de valores de query via `innerHTML` sem sanitizar.

**Robustez:**
13. `env.ts`: incluir `ENCRYPTION_KEY` no schema; falhar em produção se ausente.
14. Multi-writes em `users/cases/workflows` → transação (RPC/`SECURITY INVOKER` ou seq); `documents` delete → soft-delete; validar datas; tratar `NaN` no finance.
15. Não expor `error.message` — usar mapa de mensagens genérico.
16. Não enviar CPF/CNPJ a IA; mascarar PII em logs; colapsar `message_body`.

**Migrations:**
17. Consertar `0005`/`0014` ordem; renomear `team_members` (colisão 0015×0023).

**Perf/UX/termo:**
18. Deduplicar `<head>`/CSS inline; paginação/N+1 em `reports`/`finance`; tokens de cor; i18n; a11y (modals/aria/tabelas); remover `<h1>` duplicados.

---

## 8. Testa priorizada (roadmap sugerido)

Se for criar um plano de correção, a ordem lógica de priorização poderia ser: **RLS (P0) → rotas IDOR/tenant → auth (senha/2FA) → webhooks (idempotência/rate) → sanitização/XSS → erros→usuário → multi-write→transação → role em rotas sensíveis → PII/IA → migrations/fresh install → perf/UX/docs.**

---

*Documento gerado por auditoria completa do código-fonte (leitura estática de 62+ rotas, núcleo, 30 migrations, componentes, env/config de deploy). Nenhum arquivo foi modificado.* ******************************************************************