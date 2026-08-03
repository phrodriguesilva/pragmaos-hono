# Auditoria Completa — PragmaOS 2 (Rodada 3 / Pós-correção 2)

**Data:** 2026-08-02
**Contexto:** Rodada 1 (`AUDITORIA-COMPLETA.md`) + Rodada 2 (`AUDITORIA-COMPLETA-2.md`).
Nesta rodada foram aplicados, além do commit `81e4c2e`, o commit **`16370ce`** ("fix: regressão team_members, fresh install migrations, IDOR em 9 rotas, webhooks, env") e, segundo o relato, a migration **`0031`** foi aplicada no banco e o app foi **deployado na Vercel (produção)**.
**Escopo desta rodada:** (a) verificação da base; (b) auditoria técnica das novas correções em `16370ce`; (c) **bugs/regressões introduzidos ou que garantirão**; (d) divergência entre **banco real** e **repo**; (e) gaps remanescentes. Nenhum arquivo foi modificado.

---

## 0. Crítica de confiança (importante ler primeiro)

**Esta auditoria verifica apenas o REPOSITÓRIO (código + SQL das migrations).**
Não tenho acesso ao banco Supabase nem à Vercel diretamente. O estado de **banco** e **deploy** descritos abaixo são **do seu relato**, não foram confirmados por mim. Itens sensíveis que dependem do estado real do banco estão marcado como **`[DEPENDE DO BANCO]`**.

---

## 1. Re-verificação da base (executada)

| Checagem | Comando | Resultado |
|---|---|---|
| Typecheck | `bun run typecheck` | ✅ PASS |
| Testes | `bun test` | ✅ 91 pass / 0 fail |
| Build | `bun run build` | ✅ (330/419 módulos) |
| Commits desde a Rodada 2 | `git log` | ✅ `16370ce` presente em `main` |

---

## 2. Correções em `16370ce` — auditoria item a item

### ✅ 2.1 Revertida nomenclatura `team_members` (regressão da rodada 2 corrigida)
- Agora **`team_members` = tabela INTERNA** (times de usuários, `0015`) e a pública passa a se chamar **`public_team_members`**.
- `teams.tsx` (interno) continua usando `team_members` — **correto agora**.
- `public-site.tsx` e `site-admin.tsx` usam **só** `public_team_members` (verificado: nenhum `from("team_members")` restante nesses dois).
- `0023` foi editada **in-place** para `public_team_members`.
- ✅ **Código consistente.** (A subaplicação no banco é outro assunto — ver §3.)

### ✅ 2.2 Migrations fresh-install editadas in-place (ordem)
- `0005`: `ALTER TABLE integrations` envolvido em `DO $$ ... IF EXISTS (...)$$` — não aborta quando a tabela ainda não existe. **Bom.**
- `0006`: reafirma o constraint `integrations_type_check` no fim. **OK.**
- `0014`: `dashboard_pending_honorarios_total` trocado para `language plpgsql` (defere validação do corpo até runtime → não aborta por `honorarios` ainda não existir). **Bom tecnicamente.**

### ✅ 2.3 Troca de senha com client anon
- `profile.tsx` cria um client `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` dedicado para `signInWithPassword` — corrige o risco de GoTrue rejeitar service-role como apikey. **Correto.**

### ✅ 2.4 `ENCRYPTION_KEY` no `env.ts`
- Adicionado ao schema zod, ao tipo, ao fallback e aos exports.
- `crypto.ts` agora importa `ENCRYPTION_KEY` de `env.ts` (não lê `process.env` diretamente).
- **Bom.** Mas notar em §3.4: só garante que o valor chegue; a aplicação ao deploy é responsabilidade do Vercel.

### ✅ 2.5 Webhooks — idempotência WhatsApp
- `whatsapp-webhook.ts` agora consulta `external_message_id` existente antes de inserir (`.maybeSingle()` + `continue`). **Corrige o dedup de retries.** ✔

### ✅ 2.6 IDOR — 9 rotas restantes
Pelo diff, cada uma ganhou checagem de ownership:
- `workflows` (case/client/assigned_to do action_config), `messages` (channel + user_id), `signatures` (+ `.eq(tenant_id)` em busca de documento), `billing`, `cashflow`, `finance`, `companies` (helper local), `permissions` (helper local), `teams` (`profileBelongsToTenant`).
- **Verificação**: todas importam helpers de `tenant-ownership.ts` ou helpers locais. **Plausível/correto em intenção** — recomendo confirmação em pós-deploy (ver §6 testes).

---

## 3. 🔴 Bugs e riscos NOVOS introduzidos / mantidos NESTE commit

### 🔴 3.1 Migration `0032_migration_order_fixes.sql` está ROMPIDA
- O `0032` cria **dois triggers** (linhas ~85 e ~135) que executam `public.set_updated_at_team_members()`:
  - Branch A (desfazer rename do 0031): linha 85
  - Branch B (fresh install): linha 135
- **VERIFICADO:** em **nenhuma** migration existe `create function public.set_updated_at_team_members(...)`. A função **nunca é criada** no repo.
- **Consequência:** ao aplicar o `0032` (em qualquer banco, branch A ou B) o `create trigger ... execute function public.set_updated_at_team_members()` **falha** (`function does not exist`), abortando a migration.
- **Nota:** o `update_updated_at()` usado em outras migrações é outro nome — não serve.
- **Correção necessária:** adicionar `create or replace function ...set_updated_at_team_members()` (com `set search_path = public`) **antes** dos triggers, ou trocar para usar `public.update_updated_at()` existente.

### 🔴 3.2 [DEPENDÊNCIA DO BANCO] Estado real do banco diverge do que o `0032` presume
Pelo seu relato, o banco tinha **uma única tabela `team_members` MESCLADA** (colunas internas `team_id/user_id/role` E públicas `public_name/slug/profile_id` — `0023` adicionou colunas), sem `public_team_members` nem `team_members_internal`.
- O código **novo** lê `public_team_members` (página pública) e `team_members` (interno).
- Se o `0032` **não** foi aplicado ao banco, **`public_team_members` não existe** → a página pública `/equipe` e o admin `/site/team` **quebram em produção** (relação não existe).
- Se o `0032` foi aplicado: ele **não migra dados** — a tabela mesclada atual não é renomeada, e `public_team_members` seria criada **vazia** (dados de equipe pública existentes ficam órfãos na `team_members` mesclada).
- **O estado mesclado atual não corresponde a nenhum dos dois branches do0032** (A assume `team_members_internal`; B assume `team_members` interna pura). **Há um gap de migração de dados real.**
- → **[DEPENDÊ DO BANCO]** confirmar: (1) o `0032` foi aplicado? (2) existe `public_team_members`? (3) há linhas de equipe pública atuais que precisam migrar?

### 🟠 3.3 [DEPENDÊ DO DEPLOY] `0031` aplicado sem a parte `notify_tenant/notify_user`
- Pelo relato, o `0031` foi aplicado **sem** o bloco `notify_tenant/notify_user` (as funções não existem no banco, `0017` não foi aplicado).
- A migration `0031` atual no repo **referencia** `notify_tenant/notify_user` na parte de revogação + recriação. Se essas funções **não existem**, aplicar o arquivo `0031.sql` completo falharia. O facto de ter sido aplicado **parcialmente** (só RLS/consultas) é **fragil**: qualquer re-aplicação completa do arquivo em prod) falharia.
- → O **repositório** tem `0031` referenciando funções que podem não existir no banco. Recomendo separar o bloco `notify_*` ou envolver em `DO IF EXISTS`.

---

## 4. Gaps remanescentes NÃO tocados (Rodadas 1 e 2, ainda pendentes)

Confirmado por grep/diff que **nenhum destes** foi alterado nos dois commits:

| Item | Severidade | Noto |
|---|---|---|
| `error.message` vazando ao usuário (~10 rotas) | 🟠 | clients/templates/proceedings/api/api-keys/calendar/diario/intimacoes/trust-accounts/consultas |
| PII (CPF/CNPJ) para o LLM sem máscara + logs `input_text/output_text` | 🟠 | ai-chat.tsx, app petitions |
| Multi-write sem transação | 🟠 | users (invite+profile+audit), cases (case+event), workflows |
| Hard delete em `documents` (vs soft-delete) | 🟠 | documents.tsx |
| Segredos de integração em plaintext (`integrations.config`) | 🟠 | integrações.tsx |
| Catálogo de planos duplicado (marketing vs subscription) | 🟡 | |
| Rate limiting/captcha em `intake-public` e webhooks | 🟡 | só signup tem |
| **Testes de segurança: 0 novos** | 🟠 | `bun test` segue 91, nada sobre session/tenant-ownership/RLS |
| i18n, a11y (modais/aria), tokens de cor, `<head>`/CSS duplicado | 🟢 | |
| Página/esquema mítico `intake-public` sem validação XSS de placeholder/id | 🟠 | |

---

## 5. Veredito por área

| Área | Rodada 2 | Rodada 3 |
|---|---|---|
| Base (build/typecheck/testes) | ✅ | ✅ (sem testes novos) |
| RLS escalada `profiles` | ✅ | ✅ (aplicado — per seu relato; ver §3.3) |
| RLS consultas cross-tenant | ✅ | ✅ |
| XSS (editor/EditModal/CSS) | ✅ | ✅ (+ m2) |
| Auth senha (client anon) | ⚠️ | ✅ corrigido |
| Auth 2FA | ✅ | ✅ |
| RBAC | ✅ | ✅ |
| IDOR 8+9 rotas | 🟠 parcial | 🟡 bem ampliado (falta validar a content em runtime) |
| Migrations fresh-install ordem | ❌ | ✅ in-place 0005/0006/0014 |
| **Migration `0032`** | — | 🔴 **BUG: função trigger inexistente** |
| **[BANCO] `team_members` mesclado vs `public_team_members`** | — | 🔴 **risco de dados/relação ausente** |
| Webhooks idempotência | ❌ | ✅ (whatsapp dedup) |
| ENCRYPTION_KEY env+garação | ❌ | ✅ (repo), ⚠️ [deploy] |

---

## 6. Recomendações para a próxima rodada (priorizada)

1. **P0 — Arrumar `0032`:** criar a função `set_updated_at_team_members()` (ou trocar por `update_updated_at()`) antes dos triggers, para a migration não abortar.
2. **P0 — [DB] Decidir o destino da `team_members` mesclada:** mover dados públicos para `public_team_members` e migrar `XXXX` → renomeando a atual ou re-criando; garantir que `public_team_members` exista antes do deploy do código que a usa (senão `/equipe` quebra).
3. **P1 — `0031`/`notify_*`:** transformar o bloco `notify_tenant/notify_user` em idempotível (DO `IF EXISTS`); separar para não romper ao aplicar de novo.
4. **P1 — Confirmar pós-deploy:** aplicar migrations no banco **de forma completa e testada** (não parcial), rodar `0032` corrigido, e validar que `public_team_members` existe.
5. **P1 — Deploy:** configurar `ENCRYPTION_KEY` na Vercel (agora exigida em prod) e verificar `health` apsta produção.
6. **P1 — Testes de segurança:** criar testes para `tenant-ownership`, `requireRole`, idempotência de webhook, e o trigger de proteção de perfis (mínimo para travar regressões).
7. **P2 —** erro→usuário, PII→IA, transações, soft-delete documents, integrações plaintext, catálogo duplicado, rate-limit intake-public.
8. **P3 —** i18n/a11y/tokens/docs/README.

---

*Auditoria sobre REPOSITÓRIO (gits de `main`). Se pontos divergirem do estado real do banco/deploy, eles foram marcados `[DEPENDÊ DO BANCO]`/`[DEPENDÃO DO DEPLOY]` para validação. Nenhum arquivo foi modificado.*