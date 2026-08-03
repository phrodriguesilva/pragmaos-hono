# Auditoria Completa — PragmaOS 2 (Rodada 4 / Pós-correção 3)

**Data:** 2026-08-02
**Contexto:** Rodadas 1–3 (`AUDITORIA-COMPLETA[-2|-3].md`). Nesta rodada foi aplicado o commit **`a879e01`** ("fix: 0032 quebrada, 0031 idempotente, PII masking, error.message, soft-delete, planos") e, segundo o relato, `public_team_members` foi criada no banco via MCP e o app deployado na Vercel.
**Escopo desta rodada:** (a) verificação da base; (b) auditoria das 6 correções de `a879e01`; (c) novos problemas/leaks não contemplados; (d) gaps remanescentes. **Nenhum arquivo foi modificado.**

> **Nota de confiança:** a auditoria verifica o **repositório**; estado de banco/deploy vem do seu relato (marcado `[DB]`/`[DEPLOY]`).

---

## 0. Re-verificação da base (executada)

| Checagem | Comando | Resultado |
|---|---|---|
| Typecheck | `bun run typecheck` | ✅ PASS |
| Testes | `bun test` | ✅ 91 pass / 0 fail |
| Build produção | `bun run build` | ✅ (422 módulos, bundle 4.13 MB) |
| HEAD | `git log -1` | ✅ `a879e01` em `main` |

---

## 1. Correções de `a879e01` — auditoria item a item

| Item | Status | Análise técnica |
|---|---|---|
| **0032 rompida** | ✅ **CORRIGIDO** | `.set_updated_at_team_members()` (inexistente) trocado por `update_updated_at()` (existe em `0001`/`0022`). Migração simplificada: cria `public_team_members` do zero + RLS + indexes + trigger `update_updated_at()`; bloco de `integrations_type_check` envolvido em `DO IF EXISTS`. Reativa sem referência a funções fantasma. |
| **Estado banco `team_members`** | ✅ **[DB] corrigido** | `public_team_members` criada no banco (rel vazio; tabela mesclada original deixada intacta como "lixo" harmônico). Página `/equipe` e `/site/team` voltam a funcionar. |
| **0031 idempotente** | ✅ CORRIGIDO | Bloco `notify_tenant`/`notify_user` envolvido em `DO $$ IF EXISTS (pg_proc) ... END IF $$`. Não aborta quando as funções não existem (0017 não aplicado). Re-aplicação segura. |
| **PII masking → LLM** | ✅ CORRIGIDO | Novo `src/lib/pii-mask.ts` (`maskCPF/maskCNPJ/maskEmail/maskPhone`, aplicados via `maskPII`). `ai-chat.tsx` mascara em 6 pontos; `cases.tsx` mascara antes de resumo/sugestões. |
| **error.message → usuário** | 🟡 **PARCIAL** | 10 leaks em 6 rotas corrigidos (clients, templates, proceedings, api, diario-oficial, consultas), mantidos em `console.error`. **Mas restam leaks em rotas fora da lista (ver §2).** |
| **Hard→soft delete documents** | ✅ CORRIGIDO | DELETE agora seta `deleted_at`; listagem filtra `.is("deleted_at", null)`. |
| **Catálogo de planos duplicado** | ✅ CORRIGIDO | Novo `src/lib/plans.ts`; `marketing.tsx` (PLANS) e `subscription.tsx` (PLAN_INFO/PLAN_FEATURES/PRO_FOOTNOTE) importam dele. Single source of truth. |

### 1.b Planos — notas de consistência
- `subscription.tsx:50` continua consultando a tabela `plans` do banco **além** de usar `PLANS` de `plans.ts` — há duas fontes (DB vs TS). Confirmar se a intenção era só o TS (se sim, a leitura do DB pode divergir do `plans.ts`). Vale manter como está se o DB for a fonte dinâmica e `plans.ts` só para a página estática — mas isso **reativa o risco de divergência** entre banco e `plans.ts`. ❕ Item a vigiar.

---

## 2. 🔴 Novos problemas / restos encontrados nesta rodada

### 🟠 2.1 `error.message` AINDA vazado ao usuário em rotas NÃO cobertas
Fora das 6 rotas corrigidas, permanecem exposições diretas de `error.message` na UI/JSON:
- `timesheet.tsx:243` — `Erro ao salvar: {error.message}` ✓ (renderPage)
- `upload.ts:108` — `c.json({ error: \`Erro no upload: ${error.message}\` }, 500)`
- `timer.tsx:86` — `c.json({ error: error.message }, 400)`
- `profile.tsx:322` — `Erro ao alterar senha: {error.message}`
- `auth.tsx:899` — `Erro ao redefinir senha: ${error.message}`
- `import.tsx:473,561` — `errorDetails.push(... ${error.message})` (detalhamento ao usuário)

> Em `auth.tsx:899`/`profile.tsx:322` o `error.message` de autenticação pode conter detalhe interno. Recomendo padronizar as 8 mensagens para genérica mantendo `console.error` (mock da abordagem já usada nas 6 rotas).

### 🟠 2.2 Documentos: soft-delete é aplicado, mas conferir consistência do restante
- `documents.tsx` agora seta `deleted_at` e filtra listas. **Conferir** que qualquer outra rota que leia `documents` (ex.: `signatures` que busca documento por id) também filtra/trata `deleted_at`, senão o doc soft-deletado ainda aparece em assinatura/relações. (Não verificado nas demais consultas.)

### 🟠 2.3 [DB] reurno `public_team_members` criada manualmente × `0032`
- `0032` (no repo) faz `create table if not exists public_team_members ...` → **idempotente** para o caso de já existir (o que você fez via MCP). Não quebra.
- Porém `0032` **não remove** as colunas públicas remanescentes na `team_members` original mesclada (documentado como inofensivo). Se no futuro o código interno passar a usar `team_members` para algo, as colunas extras são ruído, não bug. **OK, aceitável.**

---

## 2. Gaps remanescentes (NÃO tocados nas 4 rodadas)

| Item | Severidade |
|---|---|
| Multi-write sem transação (users invite+profile+audit; cases case+event; workflows exec) | 🟠 |
| Segredos de integração em plaintext (`integrations.config`: api_key/client_secret/app_secret) | 🟠 |
| Rate limit / captcha em `intake-public` e webhooks | 🟡 |
| PII: `communications.message_body`, `proceedings.movement_text` visíveis a todo o tenant; dashboard `recentMovements` | 🟠 |
| **Testes de segurança: 0 novos** (`bun test` = 91; nada de cert-ownership/session/sanitize/RLS/webhook-dedup) | 🟠 |
| i18n, a11y (modais sem trap, aria em botões-ícone, scope/caption em tabelas) | 🟢 |
| Tokens de cor hardcoded + `carvao-600/700/800` colapsados + terracota→azul | 🟢 |
| `<head>`/CSS inline duplicado; scripts reveal/counters x2; N+1 em reports/finance | 🟢 |
| Múltiplos `<h1>` (portal, public-site, onboarding, auth, marketing) | 🟢 |
| README desatualizado; DEPLOY.md omite `ENCRYPTION_KEY` | 🟢 |
| `[DEPLOY] ENCRYPTION_KEY` precisa estar configurada no Vercel (agora exigida em prod) | 🟠 |
| `[OPERAÇÃO]` rotacionar token Upstash (vazamento histórico) | 🟠 |
| `[OPERAÇÃO]` verificar `/health/ready` após deploy | 🟢 |

---

## 3. Veredito por área (evolução)

| Área | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| Base (build/typecheck/tests) | ✅ | ✅ | ✅ | ✅ |
| RLS escalada / consultas / notify | 🔴 | ✅ | ✅ | ✅ |
| XSS (editor/EditModal/CSS) | 🔴 | ✅ | ✅ | ✅ |
| Auth senha/2FA | 🟠 | ✅ | ✅ | ✅ |
| RBAC | 🟠 | ✅ | ✅ | ✅ |
| IDOR (ownership) | 🔴 | 🟠 | 🟡 | 🟡 |
| Migrations fresh (*) | 🔴 | ❌ | ✅ 0005/0006/0014 | ✅ +0032 fix |
| **Migration 0032** | — | 🔴 | 🔴 bug | ✅ corrigido |
| **[DB] public_team_members** | — | 🔴 | 🔴 ausente | ✅ criada |
| Webhooks idempotência | 🟠 | 🟡 | ✅ | ✅ |
| PII→LLM | 🟠 | 🔴 | 🟠 | ✅ masked |
| error.message→user | 🟠 | 🟠 | 🟠 | 🟡 parcial (restantes) |
| Soft-delete documents | 🟠 | 🟠 | 🟠 | ✅ a-door |
| Planos duplicados | 🟡 | 🟡 | 🟡 | ✅ coal |
| Testes segurança | 🔴 | 🔴 | 🔴 | 🔴 |

---

## 4. Próximas correções recomendadas (priorizadas)

1. **P1 — Padronizar `error.message`** nas 8 rotas restantes (timesheet, upload, timer, profile, auth reset, import) — mesma técnica das 6 já corrigidas.
2. **P1 —** verificar/procurar `deleted_at` em toda consulta que lê `documents` (principalmente `signatures`).
3. **P1 — `[DEPLOY]`** garantir `ENCRYPTION_KEY` na Vercel (senão routes de tokens OAuth em produção → throw).
4. **P1 — `[OPERAÇÃO]`** rotacionar token Upstash. verificar `/health/ready`.
5. **P1 — Testes de segurança** mínimos: `tenant-ownership`, idempotência webhook, trigger de perfis, `requireRole`. Moita a trava para regressões.
6. **P2 —** transações multi-write; criptografar `integrations.config`; rate-limit/captcha `intake-public`; mascarar PII em mais logs.
7. **P3 —** a11y/i18n/tokens/dup< head>/CSS/README.

---

*Auditoria sobre REPOSITÓRIO (git `main`, incl. `a879e01`). Itens `[DB]`/`[DEPAUT]` dependem do seu confirmação real. Nenhum arquivo foi modificado.*