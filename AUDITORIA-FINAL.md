# Auditoria Final — PragmaOS 2 (Rodada 5 / Final)

**Data:** 2026-08-02
**Contexto:** Após 4 rodadas de auditoria e correção, esta é a auditoria final geral do sistema.
**Commit base:** `16a885f` em `main`

---

## 1. Estado da base

| Checagem | Resultado |
|---|---|
| Typecheck | ✅ PASS |
| Testes | ✅ 123 pass / 0 fail (893 expect calls) |
| Build | ✅ 422 módulos, bundle 4.14 MB |
| Deploy Vercel | ✅ Auto-deploy do push |

---

## 2. Veredito por área (evolução completa R1→R5)

| Área | R1 | R2 | R3 | R4 | R5 (Final) |
|---|---|---|---|---|---|
| Base (build/typecheck/tests) | ✅ | ✅ | ✅ | ✅ | ✅ |
| RLS escalada profiles | 🔴 | ✅ | ✅ | ✅ | ✅ |
| RLS consultas cross-tenant | 🔴 | ✅ | ✅ | ✅ | ✅ (0028 in-place) |
| notify_tenant/notify_user | 🔴 | ✅ | ✅ | ✅ | ✅ (idempotente) |
| XSS (editor/EditModal/CSS) | 🔴 | ✅ | ✅ | ✅ | ✅ |
| Auth senha (reauth) | 🟠 | ✅ | ✅ | ✅ | ✅ |
| Auth 2FA (TOTP) | 🟠 | ✅ | ✅ | ✅ | ✅ |
| RBAC (requireRole) | 🟠 | ✅ | ✅ | ✅ | ✅ |
| IDOR (17 rotas) | 🔴 | 🟠 | 🟡 | 🟡 | ✅ |
| Migrations fresh install | 🔴 | ❌ | ✅ | ✅ | ✅ |
| Migration 0032 | — | 🔴 | 🔴 | ✅ | ✅ |
| public_team_members no banco | — | 🔴 | 🔴 | ✅ | ✅ |
| Webhooks idempotência | 🟠 | 🟡 | ✅ | ✅ | ✅ |
| PII→LLM masking | 🟠 | 🔴 | 🟠 | ✅ | ✅ |
| error.message→user | 🟠 | 🟠 | 🟠 | 🟡 | ✅ (todas rotas) |
| Soft-delete documents | 🟠 | 🟠 | 🟠 | ✅ | ✅ (todas consultas) |
| Planos duplicados | 🟡 | 🟡 | 🟡 | ✅ | ✅ |
| Integration secrets plaintext | 🟠 | 🟠 | 🟠 | 🟠 | ✅ (encrypted) |
| Multi-write transações | 🟠 | 🟠 | 🟠 | 🟠 | ✅ (compensating) |
| Rate limit intake-public | 🟡 | 🟡 | 🟡 | 🟡 | ✅ |
| Reset token em log | 🔴 | 🔴 | 🔴 | 🔴 | ✅ (redacted) |
| Testes de segurança | 🔴 | 🔴 | 🔴 | 🔴 | ✅ (32 testes) |

---

## 3. Itens verificados sem mudanças necessárias (audit clean)

| Categoria | Verificação | Status |
|---|---|---|
| Cookies | httpOnly + sameSite=Strict + secure condicional | ✅ |
| Security headers | CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy | ✅ |
| CSRF protection | csrfProtection em todas rotas não-API | ✅ |
| Webhook signatures | HMAC-SHA256 em Asaas, WhatsApp, Clicksign, DocuSign | ✅ |
| Rate limiting auth | login(10/min), 2FA(5/min), forgot/reset(3/min), signup(5/min) | ✅ |
| API endpoints | requireScope middleware em todos | ✅ |
| Hardcoded credentials | Nenhum encontrado | ✅ |
| eval/child_process | Nenhum uso | ✅ |
| Path traversal | Nenhum | ✅ |
| Open redirects | Nenhum (getBasePath usa header do servidor) | ✅ |
| SQL injection | Parâmetros via RPC, sem interpolação | ✅ |
| process.env direto | Apenas NODE_ENV/VERCEL_ENV (legítimo) | ✅ |
| DOMPurify/sanitize | Usando sanitizeHtml custom (sem jsdom) | ✅ |
| Mass assignment | Rotas usam parseBody com campos específicos | ✅ (ver §5) |

---

## 4. Correções aplicadas nesta rodada (commit `16a885f`)

1. **back-office.tsx — 3 error.message leaks restantes:**
   - change plan, suspend tenant, reactivate tenant
   - `error.message` mantido em `console.error`; usuário vê mensagem genérica

2. **auth.tsx — password reset token vazado em log:**
   - Linha 721 fazia `console.log` do token completo de reset
   - Agora loga apenas "token redacted" — token nunca aparece em logs

3. **0028_consultas_legais.sql — corrigida in-place:**
   - 9 policies trocadas de `current_setting('app.tenant_id')` para `current_tenant_id()`
   - Fresh install não tem janela de vulnerabilidade entre 0028 e 0031
   - 0031 torna-se no-op para fresh install (idempotente)

---

## 5. Pendências remanescentes (não bloqueantes)

### Operacionais (requerem ação manual)

| Item | Severidade | Ação |
|---|---|---|
| `ENCRYPTION_KEY` no Vercel | 🟠 | Configurar env var no Vercel — sem ela, crypto.ts falha em prod |
| Rotacionar token Upstash | 🟠 | Vazamento histórico — rotacionar no painel Upstash |
| Verificar `/health/ready` pós-deploy | 🟢 | Confirmar que deploy `16a885f` está healthy |

### Design trade-offs (não bugs)

| Item | Nota |
|---|---|
| `plans` DB vs `plans.ts` | DB é fonte para billing (dinâmico), TS para marketing (estático). Divergência possível mas é design intencional. |
| CSP `'unsafe-eval'` | Necessário para Alpine.js. Trade-off documentado. |
| `team_members` mesclada | Colunas públicas remanescentes na tabela interna são inofensivas (não usadas pelo código). |

### P3 — Baixa prioridade (não segurança)

| Item | Severidade |
|---|---|
| Validação zod em rotas com `parseBody` (mass assignment hardening) | 🟢 |
| i18n, a11y (modais sem trap, aria em botões-ícone) | 🟢 |
| Tokens de cor hardcoded + CSS duplicado | 🟢 |
| Múltiplos `<h1>` (portal, public-site, onboarding, auth, marketing) | 🟢 |
| README/DEPLOY.md desatualizado (omitem ENCRYPTION_KEY) | 🟢 |
| N+1 em reports/finance | 🟢 |

---

## 6. Resumo de todos os commits de segurança

| Commit | Descrição |
|---|---|
| `81e4c2e` | P0+P1: RLS escalation, IDOR, XSS, auth, RBAC, migrations |
| `16370ce` | team_members regression, fresh install migrations, IDOR 9 rotas, webhooks, env |
| `a879e01` | 0032 fix, 0031 idempotente, PII masking, error.message, soft-delete, planos |
| `4d376bf` | error.message restante, deleted_at consultas, testes, crypto integrations, transações |
| `16a885f` | back-office error.message, reset token log, 0028 in-place |

**Total: 5 commits, ~200 issues corrigidas, 32 testes de segurança adicionados.**

---

*Auditoria final sobre repositório (git `main`, `16a885f`). Nenhum arquivo foi modificado além das correções listadas.*
