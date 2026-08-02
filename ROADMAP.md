# PragmaOS — Roadmap

> Última atualização: 2026-08-01
> Baseado na auditoria completa do código + análise externa de produto.

---

## Estado Atual

**48 rotas** | **20 migrations** | **18 libs** | SaaS multi-tenant para advocacia

### O que já está feito e funcionando

#### Segurança (corrigida após auditoria)
- [x] Verificação de assinatura JWT via `supabase.auth.getUser()` (`session.ts`)
- [x] RLS habilitado nas 8 tabelas que estavam sem isolamento (`0013`)
- [x] Storage bucket isolado por tenant_id (`0013`)
- [x] Policies do diario_* e document_templates corrigidas (`0013`)
- [x] Rate limiting em login/2FA/reset de senha (`rate-limit.ts`)
- [x] Hash de tokens de reset de senha (SHA-256, não texto plano) (`auth.tsx`)
- [x] Sanitizador HTML no editor de documentos (`editor.tsx`)

#### Banco de dados (corrigido após auditoria)
- [x] Funções de agregação para dashboard no Postgres (`0014`)
- [x] Tabelas e índices faltantes (`0015`)
- [x] Unique constraints (cnj_number, invoice number, cpf, cnpj) (`0015`)
- [x] Foreign keys com ON DELETE CASCADE/SET NULL (`0016`)
- [x] Sistema de notificações in-app (`0017`)
- [x] Trust accounts (conta corrente do cliente / custas) (`0018`)
- [x] API keys + webhooks + deliveries (`0019`)

#### Funcionalidades novas (adicionadas após auditoria)
- [x] Verificação de conflito de interesses (`conflict.ts`)
- [x] Gov.br OAuth (`govbr.ts`)
- [x] Intimações eletrônicas via intima.ai (`intimacoes.ts`)
- [x] NFS-e (Nota Fiscal de Serviço Eletrônica) (`nfse.ts`)
- [x] MNI/PJe (SOAP/WSDL para tribunais) (`mni.ts`)
- [x] Cálculo de prazos processuais CPC/2015 com feriados (`prazos.ts`)
- [x] Busca global via API JSON (`search.tsx`)
- [x] Timer de horas com API JSON (`timer.tsx`)
- [x] API REST v1 pública com escopos (`api.tsx`, `api-auth.ts`)
- [x] Gestão de API keys e webhooks (`api-keys.tsx`)
- [x] Exportação CSV (`export.ts`)
- [x] Calendário (`calendar.tsx`)
- [x] Rota de notificações (`notifications.tsx`)
- [x] Rota de trust accounts (`trust-accounts.tsx`)
- [x] Rota de intimações (`intimacoes.tsx`)
- [x] Rota de prazos processuais (`prazos.tsx`)

---

## Roadmap

### Fase 1 — Segurança Restante (prioridade máxima)

Os itens críticos da auditoria já foram resolvidos. Estes são os que restam.

| # | Tarefa | Esforço | Arquivos |
|---|--------|---------|----------|
| 1.1 | **OAuth state criptográfico + PKCE** — substituir `tenantId:userId` por UUID aleatório + assinatura HMAC. Implementar PKCE em Google/Microsoft/DocuSign. | Médio | `oauth.tsx` |
| 1.2 | **Verificação HMAC nos webhooks** — WhatsApp (X-Hub-Signature-256) e ClickSign (substituir stub que sempre retorna true). | Médio | `whatsapp-webhook.ts`, `integrations.ts` |
| 1.3 | **Refresh de OAuth tokens** — usar refresh tokens armazenados quando access_token expira. | Médio | `oauth.tsx`, `integrations.ts` |
| 1.4 | **Criptografar OAuth tokens em repouso** — usar pgcrypto ou Supabase Vault para access_token/refresh_token. | Médio | migration + `oauth.tsx` |
| 1.5 | **CSRF protection** — token CSRF em forms POST ou usar Hono CSRF middleware com header Origin check. | Baixo | `index.ts` + todas as rotas POST |
| 1.6 | **Validação de MIME type no upload** — verificar magic bytes, não confiar no `file.type` do browser. | Baixo | `upload.ts` |
| 1.7 | **Corrigir bypass de PII masking** — mascarar PII antes de construir o prompt, não depois. | Baixo | `ai.ts` (generateCaseSummary) |
| 1.8 | **Cabeçalhos de segurança** — CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy. | Baixo | `index.ts` |
| 1.9 | **Validação de env vars no startup** — Zod schema, fail fast se SUPABASE_URL/KEY faltando. | Baixo | `env.ts` |
| 1.10 | **Rate limiter distribuído** — substituir Map em memória por Upstash Redis (compatível com Vercel serverless). | Médio | `rate-limit.ts`, `ai.ts` |

### Fase 2 — Performance e UX (alto impacto)

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 2.1 | **Streaming do chat de IA** — SSE com `stream: true` na API OpenAI + UI otimista (mensagem do usuário aparece instantaneamente, resposta surge token a token). | Alto | **Crítico** — elimina a maior dor de percepção de lentidão |
| 2.2 | **Decidir HTMX: adotar ou remover** — se adotar: começar por delete instantâneo + busca ao vivo nas listas. Se remover: deletar tag `<script>` do `base.tsx` e `public/js/htmx.min.js`. | Baixo (remover) / Médio (adotar) | Médio |
| 2.3 | **Corrigir N+1 queries restantes** — reports.tsx, teams.tsx, messages.tsx usam loops com queries por item. Migrar para agregação ou JOIN. | Médio | Médio |
| 2.4 | **Paginação em timesheet e messages** — adicionar `range()` como nas outras rotas. | Baixo | Baixo |
| 2.5 | **Feedback de validação** — substituir redirect silencioso por flash messages (cookie temporário ou query param com erro). | Médio | **Alto** — hoje usuário não sabe por que o form falhou |
| 2.6 | **Toast/notificação de sucesso/erro** — usar o sistema de notifications já criado + Alpine.js para toast transitório. | Baixo | Médio |

### Fase 3 — Mobile e Acessibilidade

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 3.1 | **Sidebar responsiva** — hamburger menu no mobile, sidebar colapsável com overlay. | Médio | Alto |
| 3.2 | **Tables com overflow-x-auto** — adicionar wrapper em todas as tables (só 3 de ~20 têm). | Baixo | Médio |
| 3.3 | **Grids responsivas** — dashboard `grid-cols-5` → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`. | Baixo | Médio |
| 3.4 | **Focus trap nos modais** — prender tab dentro do modal, Escape para fechar, restaurar foco ao fechar. | Médio | Alto (acessibilidade) |
| 3.5 | **ComboBox acessível** — adicionar ARIA attributes (`role="combobox"`, `aria-expanded`, `aria-controls`), navegação por teclado. | Médio | Alto (acessibilidade) |
| 3.6 | **Estados de loading** — skeleton loaders para tables, spinner durante submit de forms. | Baixo | Médio |

### Fase 4 — Infraestrutura e Qualidade

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 4.1 | **Testes** — começar com Bun test nos libs críticos: `session.ts`, `ai.ts`, `conflict.ts`, `prazos.ts`, `rate-limit.ts`. Depois testes de rota para auth. | Alto | Alto |
| 4.2 | **CI/CD com GitHub Actions** — typecheck + build + test em PRs. Auto-deploy no merge para main. | Médio | Alto |
| 4.3 | **Observabilidade** — Sentry para erros, structured logging (pino ou console estruturado), request IDs. | Médio | Alto |
| 4.4 | **Health checks** — `GET /health` (liveness), `GET /health/ready` (readiness com DB check). | Baixo | Médio |
| 4.5 | **Remover package-lock.json** — manter apenas `bun.lock`. | Trivial | Baixo |
| 4.6 | **Self-hostar Alpine.js** — usar `public/js/alpine.min.js` em vez de CDN unpkg. | Trivial | Baixo |
| 4.7 | **Graceful shutdown** — SIGTERM handler, completar requests em andamento. | Baixo | Médio |
| 4.8 | **Build com typecheck** — adicionar `tsc --noEmit` antes do build no Vercel. | Trivial | Médio |

### Fase 5 — Funcionalidades de Produto (vendas e diferenciação)

| # | Tarefa | Esforço | Impacto no negócio |
|---|--------|---------|-------------------|
| 5.1 | **Importação de dados (CSV/Excel)** — importar clientes e processos de outros sistemas (Astrea, Projuris, CPJ). Mapeamento de colunas, preview, validação. | Alto | **Crítico** — maior barreira de entrada para novos clientes |
| 5.2 | **Notificação proativa ao cliente via WhatsApp** — gatilho automático: novo movimento → IA traduz → envia WhatsApp para o cliente. Usa infra já existente. | Médio | **Alto** — zera volume de ligações no escritório |
| 5.3 | **Análise de rentabilidade por processo** — cruzar timesheet (horas gastas) com honorarios (valor recebido). Relatório de lucro/prejuízo por processo. | Médio | Alto — diferencial competitivo |
| 5.4 | **Busca full-text no conteúdo de documentos** — extrair texto de PDFs no upload, indexar com tsvector do Postgres, buscar dentro de petições e contratos. | Alto | Alto |
| 5.5 | **OCR em PDFs escaneados** — processar PDFs de processos físicos antigos para tornar texto pesquisável. Integrar com Tesseract ou API de OCR. | Alto | Médio |
| 5.6 | **Formulários de intake dinâmicos** — link público para cliente preencher dados + upload de documentos, alimenta `clients` automaticamente. | Médio | Médio |
| 5.7 | **Versionamento de documentos** — controle de versão antes da assinatura, diff entre versões, quem alterou o quê. | Médio | Médio |
| 5.8 | **Jurimetria interna** — catalogar resultado final de processos encerrados, gerar estatísticas por vara/tribunal/tipo. | Médio | Médio |
| 5.9 | **Self-service tenant provisioning** — signup cria tenant automaticamente, configura RLS, cria perfil de sócio. | Médio | Alto para escalar |
| 5.10 | **Extensão de navegador (PJe)** — capturar documentos e andamentos do tribunal com um clique, salvar no PragmaOS. | Muito alto | Alto — diferenciação radical |

### Fase 6 — PWA e Mobile Nativo (futuro)

| # | Tarefa | Esforço | Observação |
|---|--------|---------|------------|
| 6.1 | **PWA manifest + service worker** — installable, offline cache de páginas visitadas. | Médio | Só após Fase 3 (mobile responsivo) |
| 6.2 | **App nativo (React Native / Flutter)** — apenas se pesquisa mostrar necessidade de offline-first profundo ou features nativas (notificações push, câmera para scan de documentos). | Muito alto | Avaliar após PWA |

---

## Priorização Recomendada

```
Fase 1 (segurança restante)     ████████████░░░░  70% feito, falta ~30%
Fase 2 (performance/UX)         ░░░░░░░░░░░░░░░░  0% feito
Fase 5.1 (importação CSV)       ░░░░░░░░░░░░░░░░  0% feito — fazer em paralelo com Fase 2
Fase 3 (mobile/a11y)            ░░░░░░░░░░░░░░░░  0% feito
Fase 4 (infra/qualidade)        ░░░░░░░░░░░░░░░░  0% feito
Fase 5 (features restantes)     ░░░░░░░░░░░░░░░░  0% feito
Fase 6 (PWA/nativo)             ░░░░░░░░░░░░░░░░  0% feito
```

### Ordem sugerida de execução

1. **Fase 1** — completar segurança restante (1.1-1.10)
2. **Fase 2.1** — streaming do chat de IA (maior impacto em percepção de performance)
3. **Fase 5.1** — importação CSV/Excel (maior impacto em vendas)
4. **Fase 2.5 + 2.6** — feedback de validação + toasts (UX imediato)
5. **Fase 3** — mobile responsivo + acessibilidade
6. **Fase 4** — testes, CI/CD, observabilidade
7. **Fase 5** — features restantes por prioridade de negócio
8. **Fase 6** — PWA depois app nativo se necessário

---

## Métricas de Sucesso

| Métrica | Hoje | Meta |
|---------|------|------|
| Tempo de resposta do chat de IA | 5-30s (tela travada) | < 1s para primeiro token (streaming) |
| Tempo de carregamento de listas | 300-500ms (full reload) | < 100ms (HTMX swap ou otimizado) |
| Cobertura de testes | 0% | 60% nos libs críticos |
| Lighthouse mobile score | ~30 (estimado) | > 80 |
| Tempo de onboarding de novo cliente | Manual (horas) | < 10 min (importação CSV) |
| Vulnerabilidades críticas | 3 restantes (OAuth, HMAC, CSRF) | 0 |

---

## Notas

- Este roadmap é vivo — atualizar conforme itens são completados.
- Itens marcados como "Alto esforço" podem ser quebrados em sub-tarefas.
- A Fase 5.1 (importação CSV) pode rodar em paralelo com a Fase 2, pois são áreas independentes do código.
- A Fase 4 (testes/CI/CD) idealmente começa cedo mas não bloqueia features — adicionar testes aos libs críticos primeiro.
