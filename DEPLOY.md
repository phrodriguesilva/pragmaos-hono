# Guia de Deploy — PragmaOS 2

## Prerequisitos

1. **Vercel** — conta e CLI instalado (`npm i -g vercel`)
2. **Supabase** — projeto criado com migrations aplicadas
3. **Upstash Redis** — para rate limiting distribuido (opcional mas recomendado)
4. **Sentry** — para error tracking em producao (opcional)

## 1. Configurar Supabase

```bash
# Aplique as migrations
supabase db push

# Anote as credenciais:
# - SUPABASE_URL (Project URL)
# - SUPABASE_SERVICE_ROLE_KEY (service_role key)
# - SUPABASE_ANON_KEY (anon key)
```

## 2. Configurar Upstash Redis (rate limiting)

```bash
# 1. Crie uma conta em https://upstash.com
# 2. Crie um Redis database (free tier: 10k commands/dia)
# 3. Copie a REST URL e o token

# Adicione ao Vercel:
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production
```

## 3. Configurar Sentry (error tracking)

```bash
# 1. Crie uma conta em https://sentry.io
# 2. Crie um projeto Node.js
# 3. Copie o DSN

# Adicione ao Vercel:
vercel env add SENTRY_DSN production
```

## 4. Configurar env vars no Vercel

### Obrigatorias (ja configuradas)

```bash
vercel env ls  # deve mostrar:
# APP_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
```

### Recomendadas

```bash
# IA (OpenAI ou compativel)
vercel env add AI_API_KEY production
vercel env add AI_BASE_URL production
vercel env add AI_MODEL production
vercel env add AI_RATE_LIMIT_PER_TENANT production

# CNJ DataJud
vercel env add CNJ_API_KEY production
vercel env add CNJ_BASE_URL production
```

### Opcionais (integracoes)

```bash
# Gov.br OAuth
vercel env add GOVBR_CLIENT_ID production
vercel env add GOVBR_CLIENT_SECRET production
vercel env add GOVBR_REDIRECT_URI production

# WhatsApp Cloud API
vercel env add WHATSAPP_APP_SECRET production
vercel env add WHATSAPP_PHONE_NUMBER_ID production
vercel env add WHATSAPP_ACCESS_TOKEN production

# Clicksign
vercel env add CLICKSIGN_ACCESS_TOKEN production
vercel env add CLICKSIGN_WEBHOOK_SECRET production

# SMTP (email)
vercel env add SMTP_HOST production
vercel env add SMTP_PORT production
vercel env add SMTP_USER production
vercel env add SMTP_PASS production
vercel env add SMTP_FROM production
```

## 5. Deploy

```bash
# Deploy de preview (testa antes de producao)
vercel

# Deploy de producao
vercel --prod
```

## 6. Pos-deploy

1. **Configurar APP_URL**: defina como a URL de producao do Vercel (ex: `https://pragmaos.vercel.app`)
2. **Testar health check**: `curl https://sua-url/health`
3. **Testar signup**: acesse `/signup` e crie um escritorio de teste
4. **Configurar OAuth redirects**: atualize os redirect URIs no Google/Microsoft/DocuSign para apontar para a URL de producao

## 7. CI/CD

O GitHub Actions (`.github/workflows/deploy.yml`) faz deploy automatico em push para `main`.

Certifique-se de que as secrets do GitHub Actions estao configuradas:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

## Checklist

- [ ] Supabase migrations aplicadas
- [ ] Env vars obrigatorias no Vercel
- [ ] Upstash Redis configurado (opcional)
- [ ] Sentry configurado (opcional)
- [ ] APP_URL aponta para a URL de producao
- [ ] Health check responde 200
- [ ] Signup funciona
- [ ] OAuth redirects atualizados
- [ ] GitHub Actions secrets configurados
