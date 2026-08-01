# PragmaOS 2

SaaS para gestao de escritorios de advocacia. MVP focado no escritorio do
Luiz Fabiano. Stack: Bun + Hono + Hono JSX + HTMX + Tailwind + Supabase + Zod.

Server-rendered HTML sobre HTMX (mesmo espirito do PragmaOS original em Go),
rodando no Vercel com runtime Bun. IA embarcada para traducao de movimentos
processuais, resumo de processos e sugestao de proximos passos.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Bun |
| Framework | Hono |
| Views | Hono JSX (server-rendered) |
| Interatividade | HTMX + Alpine.js (self-hosted) |
| CSS | Tailwind CSS v4 (tema sober "corporate 2003") |
| DB/Auth | Supabase (Postgres + RLS + Auth) |
| Validacao | Zod |
| IA | OpenAI-compatible API |
| Deploy | Vercel (Bun runtime) |

## Estrutura

```
src/
  index.tsx          # entry point Hono
  serve.ts           # Bun dev server
  lib/
    env.ts           # env vars
    supabase.ts      # supabase admin client
    session.ts       # auth middleware (cookie + Supabase)
    render.tsx       # helper de render com layout
    ai.ts            # PII mask + summary + traducao + next steps
  layouts/
    base.tsx         # Layout (sidebar+topbar) + AuthLayout
  components/
    icons.tsx        # Sidebar + Topbar + modulos
    ui.tsx           # Table, Panel, Badge, TextField, Select, etc.
  routes/
    auth.tsx         # login/logout
    dashboard.tsx    # painel
    clients.tsx      # CRUD clientes (PF/PJ)
    cases.tsx        # CRUD processos + IA summary/nextsteps
    proceedings.tsx  # processos CNJ + movimentos + IA traducao
    deadlines.tsx    # prazos
    hearings.tsx     # audiencias
    communications.tsx # log de comunicacao
    finance.tsx      # faturas
    documents.tsx    # documentos (Supabase Storage)
    reports.tsx      # relatorios
    users.tsx        # gestao de usuarios (socio only)
    audit.tsx        # log de auditoria
supabase/
  migrations/
    0001_initial_schema.sql
    0002_rls_policies.sql
    0003_seed.sql
public/
  css/app.css        # tailwind output (build)
  js/htmx.min.js     # self-hosted
  js/alpine.min.js   # self-hosted
scripts/
  seed.ts            # bootstrap tenant + socio
```

## Setup

1. Criar projeto no Supabase.
2. Copiar `.env.example` para `.env.local` e preencher com as credenciais do
   Supabase.
3. Rodar as migrations (SQL Editor no painel do Supabase ou `supabase db push`).
4. Criar o bucket `documents` no Supabase Storage.
5. Build do CSS: `bun run build:css`
6. Seed do primeiro tenant + socio: `bun run seed`
7. Dev server: `bun run dev`

## Deploy (Vercel)

1. Push para o repo Git.
2. Import no Vercel (detecta Bun automaticamente).
3. Configurar env vars no Vercel.
4. Deploy.

## Multi-tenant

Todo dado e isolado por `tenant_id`. RLS policies no Postgres garantem
isolamento mesmo se o client falhar. O app usa a service role key e filtra
por `tenant_id` a partir da sessao do usuario.

## IA

- Traducao de movimentos processuais (juridico -> portugues claro).
- Resumo de processos (com PII masking antes de enviar ao LLM).
- Sugestao de proximos passos.
- Rate limit por tenant (configuravel via `AI_RATE_LIMIT_PER_TENANT`).
- Human-in-the-loop: a IA aconselha, o advogado decide.
