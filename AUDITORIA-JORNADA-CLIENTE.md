# 🗺️ Auditoria — Jornada do Cliente (Marketing → Signup → Onboarding → Assinatura)

> **Criado em:** 02/08/2026  
> **Escopo:** `marketing.tsx`, `signup.tsx`, `auth.tsx`, `onboarding.tsx`, `subscription.tsx`, `billing.tsx`  
> **O que é:** Análise completa da jornada end-to-end do cliente, desde o primeiro contato no site de marketing até estar operando dentro do PragmaOS com assinatura ativa.

---

## 🗺️ Mapa Completo da Jornada

```
Marketing (/)                    Signup (/signup)              Login (/login)
┌─────────────┐                ┌──────────────┐             ┌──────────────┐
│ Landing page│───CTA──────────▶│ Form básico  │──Sucesso───▶│ Email+Senha  │
│ Hero, Plans │                │ HTML/CSS puro│             │ 2FA opcional │
│ FAQ, Depoi- │                │ Sem design   │             │ Gov.br       │
│ mentos, etc │                │ system       │             │ Forgot pass  │
└─────────────┘                └──────────────┘             └──────┬───────┘
                                                                   │
                                                                   ▼
Onboarding (/onboarding)                                    Dashboard (/)
┌─────────────────────────────────────────────┐           ┌──────────────┐
│ Step 1: Dados do Escritório                 │           │              │
│ Step 2: Áreas de Atuação (com busca!)       │──Done────▶│  Dashboard   │
│ Step 3: Convide Equipe                      │           │  principal   │
│ Step 4: Identidade (cores, logo, subdomínio)│           │              │
└─────────────────────────────────────────────┘           └──────┬───────┘
                                                                  │
                                                                  ▼
                                                          Assinatura
                                                        (/assinatura)
                                                     ┌──────────────┐
                                                     │ Trial 14 dias│
                                                     │ Escolher plan│
                                                     │ Webhook Asaas│
                                                     └──────────────┘
```

---

## 📊 Scorecard por Etapa

| Etapa | Design | UX | Segurança | Acentuação | Nota |
|-------|:------:|:--:|:---------:|:----------:|:----:|
| **Marketing** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐ (1/5) | 7/10 |
| **Signup** | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐ (1/5) | 4/10 |
| **Login/Auth** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐ (1/5) | 7/10 |
| **Onboarding** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ (2/5) | 7/10 |
| **Assinatura** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐ (1/5) | ⭐ (1/5) | 5/10 |
| **Billing** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐ (1/5) | 7/10 |

**Nota geral da jornada: 6.2/10** — O onboarding e o auth são sólidos, mas o signup é o ponto mais fraco e a acentuação prejudica toda a experiência.

---

## 1. Signup — O Ponto Mais Fraco da Jornada (4/10)

### 1.1 🚨 Design completamente diferente do resto do app
- **Arquivo:** `signup.tsx` L32-L127
- **Problema:** O formulário de signup usa **HTML/CSS inline puro** com `<style>` hardcoded, enquanto TODO o resto do app (login, onboarding, dashboard) usa o design system Tailwind + Phosphor icons. O resultado é uma **quebra visual brutal** na jornada:
  - Marketing: design premium com gradient hero, glassmorphism, Phosphor icons
  - **Signup: formulário genérico com CSS inline, sem ícones, sem branding** ← ponto de quebra
  - Login: design system correto, ícones Phosphor, layout centralizado bonito
- **Impacto:** O visitante sai de uma landing page premium e cai num formulário que parece de 2018. Isso **destrói a confiança** exatamente no momento de conversão.
- **Fix:** Reescrever usando o design system (Tailwind + Phosphor + layout semelhante ao `authShell` do `auth.tsx`).

### 1.2 🚨 Sem loading state no botão de submit
- **Arquivo:** `signup.tsx` L118
- **Problema:** O `provisionTenant()` pode levar segundos (cria usuário Supabase, tenant, profile, seeds de dados). O botão "Criar Conta" não mostra spinner nem desabilita, permitindo duplo clique.
- **Fix:** Alpine.js para disable + spinner ao submeter.

### 1.3 🚨 Sem campo de confirmação de senha
- **Arquivo:** `signup.tsx` L88-L91
- **Problema:** Só tem um campo de senha, sem confirmação. O usuário pode errar a senha e ficar trancado.
- **Fix:** Adicionar campo "Confirmar senha" com validação client-side.

### 1.4 🚨 Sem checkbox de Termos de Uso / Política de Privacidade
- **Arquivo:** `signup.tsx` L75-L119
- **Problema:** Nenhuma menção a termos, política de privacidade ou LGPD. Para um SaaS B2B jurídico, isso é um problema legal sério.
- **Fix:** Adicionar checkbox obrigatório com links para termos e política.

### 1.5 ⚠️ Sem indicador de força de senha
- Apenas `minlength="8"` no HTML. Sem feedback visual (fraca/média/forte).

### 1.6 ⚠️ Sem rate limiting no POST /signup
- **Arquivo:** `signup.tsx` L131
- **Problema:** Diferente do `auth.tsx` que tem `loginRateLimit`, o signup não tem proteção contra criação em massa de contas.
- **Fix:** Adicionar rate limiter + honeypot/captcha.

### 1.7 ⚠️ Sem verificação de e-mail
- O usuário cria a conta e já pode fazer login imediatamente. Não há envio de e-mail de confirmação nem Magic Link. Isso permite cadastro com e-mails inexistentes.

### 1.8 ⚠️ Acentuação ausente (~13 ocorrências)
- L12: `"Nome do escritorio e obrigatorio"` → `"Nome do escritório é obrigatório"`
- L13: `"Nome e obrigatorio"` → `"Nome é obrigatório"`
- L14: `"E-mail invalido"` → `"E-mail inválido"`
- L15: `"Senha deve ter no minimo 8 caracteres"` → `"Senha deve ter no mínimo 8 caracteres"`
- L26: `"Cadastro temporariamente indisponivel"` → `"indisponível"`
- L69: `"14 dias gratis"` → `"14 dias grátis"`
- L77: `"Nome do escritorio"` → `"Nome do escritório"`
- L90: `"Minimo 8 caracteres"` → `"Mínimo 8 caracteres"`
- L101: `"14 dias gratis"` → `"14 dias grátis"`
- L105: `"R$ 199/mes"` → `"R$ 199/mês"`
- L122: `"Ja tem uma conta?"` → `"Já tem uma conta?"`
- L148: `"Dados invalidos"` → `"Dados inválidos"`
- L162: `"Faca login para comecar."` → `"Faça login para começar."`

---

## 2. Auth/Login — Sólido, com detalhes a melhorar (7/10)

### 2.1 ✅ O que está bom
- Design profissional com `authShell` centralizado e limpo
- Toggle mostrar/ocultar senha com Alpine.js (excelente UX)
- **2FA completo** com QR Code, input manual e códigos de recuperação
- **Rate limiting** implementado em login, 2FA e reset de senha
- Hash SHA-256 dos tokens de reset antes de salvar no DB (boa prática)
- Integração com Gov.br
- Fluxo de "esqueci a senha" completo

### 2.2 ⚠️ Cookie `auth-user-id` em plaintext
- **Arquivo:** `auth.tsx` L239
- **Problema:** Entre o login e a verificação 2FA, o UUID do usuário é salvo em cookie como texto puro. Se o cookie não for assinado criptograficamente, alguém poderia forjar o UUID.
- **Fix:** Usar cookie assinado (HttpOnly + Secure + SameSite) ou JWT temporário.

### 2.3 ⚠️ Sem login social (Google/Microsoft)
- Para um SaaS B2B, login com Google Workspace é quase obrigatório. Muitos escritórios usam Google ou Microsoft 365.

### 2.4 ⚠️ Sem "Lembrar de mim"
- A sessão sempre expira no mesmo prazo. Sem opção de estender.

### 2.5 ⚠️ Sem loading state nos botões de submit
- Mesma ausência do signup — nenhum spinner ao clicar em "Entrar".

### 2.6 ⚠️ Acentuação ausente (~15+ ocorrências)
- L144: `"Gestao juridica para escritorios."` → `"Gestão jurídica para escritórios."`
- L194: `"Nao tem conta? Cadastre-se (14 dias gratis)"` → `"Não tem conta? ... grátis"`
- L212: `"Email e senha sao obrigatorios."` → `"são obrigatórios"`
- L218: `"Credenciais invalidas."` → `"Credenciais inválidas."`
- L302: `"Codigo de verificacao"` → `"Código de verificação"`
- L346: `"O codigo deve ter 6 digitos."` → `"O código deve ter 6 dígitos."`
- L372: `"Codigo invalido."` → `"Código inválido."`
- L413: `"Ou digite o codigo manualmente:"` → `"código"`
- L449: `"Codigos de recuperacao"` → `"Códigos de recuperação"`
- L458: `"Estes codigos nao serao exibidos novamente."` → `"códigos não serão"`
- L658: `"Email e obrigatorio."` → `"é obrigatório"`
- L789: `"Redefinicao de senha"` → `"Redefinição de senha"`
- L791: `"Link de recuperacao invalido ou ausente."` → `"recuperação inválido"`

---

## 3. Onboarding — O Melhor Fluxo da Jornada (7/10)

### 3.1 ✅ O que está muito bom
- **Layout dedicado full-screen** (sem sidebar) que mantém foco total
- **Barra de progresso** animada no topo com transição CSS
- **Step indicator** visual com números, checks e labels
- **Busca de áreas de atuação** com filtro instantâneo Alpine.js
- **Resumo de áreas selecionadas** com badges visuais
- **Color pickers** nativos para branding
- **"Pular por agora"** no header para não forçar completion
- **Promise.all** na etapa de áreas (L210) — performance correta!

### 3.2 ⚠️ Subdomínio alterado silenciosamente
- **Arquivo:** `onboarding.tsx` L478-L489
- **Problema:** Se o subdomínio escolhido já existe, o sistema adiciona um sufixo aleatório (`meu-escritorio-abc123`) sem avisar o usuário.
- **Fix:** Retornar erro pedindo para escolher outro, ou mostrar o subdomínio final.

### 3.3 ⚠️ Sem upload de logo
- Step 4 ("Identidade") tem cores, tagline e subdomínio, mas **não tem upload de logo**. O usuário precisa ir nas configurações depois para adicionar.
- **Fix:** Adicionar drag-and-drop de logo neste step.

### 3.4 ⚠️ Sem botão "Pular" individual nas etapas opcionais
- O link "Pular por agora" no header vai direto pro dashboard, saindo de todo o onboarding. Seria melhor ter "Pular esta etapa →" em cada step opcional (como equipe e branding).

### 3.5 ⚠️ Sem proteção de role
- **Arquivo:** `onboarding.tsx` L16
- **Problema:** Usa `requireAuth` mas não `requireRole`. Se um estagiário acessar `/onboarding`, pode sobrescrever dados do tenant.
- **Fix:** Restringir a `requireRole("admin", "socio")`.

### 3.6 ⚠️ Acentuação ausente (~18 ocorrências)
- L72: `"Dados do escritorio"` → `"Dados do escritório"`
- L73: `"Areas de atuacao"` → `"Áreas de atuação"`
- L76: `"Concluido"` → `"Concluído"`
- L122: `"Dados do Escritorio"` → `"Dados do Escritório"`
- L125: `"Conte-nos sobre seu escritorio"` → `"escritório"`
- L126: `"cobrancas e no seu site publico. Voce podera edita-los depois."` → `"cobranças ... público. Você poderá editá-los"`
- L130: `"Nome do escritorio"` → `"Nome do escritório"`
- L144: `"Endereco"` → `"Endereço"`
- L153: `"E-mail publico"` → `"E-mail público"`
- L158: `"Ano de fundacao"` → `"Ano de fundação"`
- L315: `"usuario no seu escritorio"` → `"usuário no seu escritório"`
- L344: `"Socio(a)"` → `"Sócio(a)"`
- L345: `"Estagiario(a)"` → `"Estagiário(a)"`
- L347: `"Recepcao"` → `"Recepção"`
- L350: `"O membro recebera um e-mail"` → `"receberá"`
- L417: `"site publico e nos documentos"` → `"site público"`
- L425: `"Descricao curta"` → `"Descrição curta"`
- L430/L437: `"Cor primaria"` / `"Cor secundaria"` → `"Cor primária"` / `"Cor secundária"`
- L445: `"Subdominio do seu site publico"` → `"Subdomínio do seu site público"`
- L527: `"Seu escritorio esta configurado"` → `"Seu escritório está configurado"`

> **Nota:** Curiosamente, alguns textos no step 2 (L219, L222, L223) **TÊM** acentos corretos. Ou seja, foi parcialmente corrigido em algum momento.

---

## 4. Assinatura/Subscription — Funcional, Segurança Crítica (5/10)

### 4.1 ✅ O que está bom
- Cards de planos com destaque visual para o Pro (borda + badge "Mais popular")
- Trial de 14 dias com countdown visual
- Integração com Asaas para pagamentos reais
- Badges de status (ativo, trial, suspenso, expirado)

### 4.2 🚨 CRÍTICO: Webhook sem validação de assinatura
- **Arquivo:** `subscription.tsx` (endpoint webhook)
- **Problema:** O webhook do Asaas **não valida nenhuma assinatura criptográfica** nem token nos headers. Qualquer pessoa que descubra a URL pode enviar um JSON falso com `status: "CONFIRMED"` e ativar uma assinatura sem pagar.
- **Impacto:** 🔴 Vulnerabilidade de segurança grave — permite burlar o pagamento inteiramente.
- **Fix:** Validar o header `asaas-access-token` ou verificar a assinatura do payload.

### 4.3 ⚠️ Sem toggle Mensal/Anual
- Os cards de planos mostram apenas preço mensal. Não há opção de billing anual com desconto (prática padrão em SaaS).

### 4.4 ⚠️ Sem portal de atualização de pagamento
- O usuário não consegue trocar cartão de crédito ou forma de pagamento sem cancelar a assinatura.

### 4.5 ⚠️ Erro silencioso na criação de cliente Asaas
- Se o tenant não tiver CPF/CNPJ, nome ou e-mail completos, a criação do cliente no Asaas pode falhar com um erro genérico sem orientar o usuário a completar os dados.

### 4.6 ⚠️ Acentuação ausente (~15+ ocorrências)
- L23: `"14 dias gratis"` → `"14 dias grátis"`
- L89: `"Trial ativo"` / L94: `"Seu trial termina em"` / `"Seu trial expirou"`
- L98: `"apos o trial."` → `"após o trial."`
- L114: `"Sua assinatura esta suspensa."` → `"está"`
- L117: `"Voce nao tem uma assinatura ativa."` → `"Você não tem"`
- L138: `"/mes"` → `"/mês"`
- L143: `"IA juridica"` → `"IA jurídica"`
- L145: `"Site publico"` → `"Site público"`
- L147: `"Integracoes"` → `"Integrações"`
- L186: `"Faturas recentes"` → mantém (ok)
- L190: `"Numero"` → `"Número"`
- L219: `"sera suspenso ao fim do periodo ja pago."` → `"será ... período já"`

---

## 5. Billing — Bem Feito Internamente (7/10)

### 5.1 ✅ O que está bom
- **Wizard modal** de 3 etapas para criar cobranças (excelente UX)
- Paginação e filtros por status
- Geração de código PIX copia-e-cola
- Isolamento de segurança com `requireRole("socio", "financeiro")`
- Todas as queries filtram por `tenant_id`

### 5.2 ⚠️ Sem geração de PDF de fatura
- Não há botão "Baixar PDF" nem "Enviar por e-mail". O usuário precisa copiar dados manualmente.

### 5.3 ⚠️ Auto-incremento de número de fatura frágil
- Se alguém editar manualmente um número para algo como `FAT-2026-ABC`, o sistema de auto-incremento quebra (retorna NaN).

### 5.4 ⚠️ Acentuação ausente (~15+ ocorrências)
- L76: `"Cliente invalido"` → `"inválido"`
- L79: `"Numero e obrigatorio"` → `"Número é obrigatório"`
- L99: `"Cartao"` → `"Cartão"`
- L100: `"Transferencia"` → `"Transferência"`
- L196: `"Cobrancas"` → `"Cobranças"`
- L202: `"Nova Cobranca"` → `"Nova Cobrança"`
- L205: `"Referencia"` → `"Referência"`
- L218: `"Numero"` → `"Número"`
- L242: `"Observacoes"` → `"Observações"`
- L282: `"Nenhuma cobranca encontrada."` → `"Nenhuma cobrança encontrada."`
- L344: `"Cobranca nao encontrada."` → `"Cobrança não encontrada."`
- L365: `"Cancelar Cobranca"` → `"Cancelar Cobrança"`

---

## 6. Análise Geral — O que Falta para Nível Premium

### 6.1 Problemas Sistêmicos (presentes em TODOS os arquivos)

| Problema | Onde | Impacto |
|----------|------|---------|
| **Acentuação ausente** | Todos os 6 arquivos (~80+ ocorrências) | 🔴 Prejudica credibilidade de um SaaS jurídico |
| **Sem loading state em botões** | signup, auth, onboarding, subscription | 🟡 Permite duplo clique, UX ruim |
| **Sem CSRF tokens** | Todos os formulários POST | 🟡 Vulnerabilidade de segurança |

### 6.2 O que SaaS Modernos Têm e o PragmaOS Não Tem (Ainda)

| Feature | Status | Prioridade | Referência |
|---------|:------:|:----------:|------------|
| **Loading spinners nos botões** | ❌ | 🔴 Alta | Todos os forms |
| **Login social (Google/Microsoft)** | ❌ | 🔴 Alta | Vercel, Linear, Notion |
| **Verificação de e-mail no signup** | ❌ | 🔴 Alta | Padrão de mercado |
| **Termos de Uso + LGPD no signup** | ❌ | 🔴 Alta | Obrigatório legalmente |
| **Indicador de força de senha** | ❌ | 🟡 Média | GitHub, Stripe |
| **Upload de logo no onboarding** | ❌ | 🟡 Média | Qualquer multi-tenant |
| **Toggle mensal/anual em planos** | ❌ | 🟡 Média | Stripe, Vercel |
| **Portal de atualização de pagamento** | ❌ | 🟡 Média | Asaas Customer Portal |
| **PDF de faturas** | ❌ | 🟡 Média | Qualquer billing |
| **Envio de fatura por e-mail** | ❌ | 🟡 Média | Qualquer billing |
| **Passkeys / WebAuthn** | ❌ | 🟢 Baixa | Google, GitHub |
| **Sessões ativas / dispositivos** | ❌ | 🟢 Baixa | Google, GitHub |
| **"Lembrar de mim" no login** | ❌ | 🟢 Baixa | Padrão de mercado |

---

## 7. Plano de Execução Priorizado

### 🔴 Sprint 1 — Acentuação + Segurança Crítica (~4-5h)

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 1 | Corrigir acentuação em `signup.tsx` (~13 textos) | 15 min | Credibilidade |
| 2 | Corrigir acentuação em `auth.tsx` (~15 textos) | 20 min | Credibilidade |
| 3 | Corrigir acentuação em `onboarding.tsx` (~18 textos) | 20 min | Credibilidade |
| 4 | Corrigir acentuação em `subscription.tsx` (~15 textos) | 15 min | Credibilidade |
| 5 | Corrigir acentuação em `billing.tsx` (~15 textos) | 15 min | Credibilidade |
| 6 | **Validar assinatura no webhook do Asaas** | 1h | 🔴 Segurança crítica |
| 7 | Adicionar rate limiting no `POST /signup` | 30 min | Segurança |
| 8 | Adicionar checkbox de Termos + LGPD no signup | 30 min | Legal/compliance |

### 🟡 Sprint 2 — Redesign do Signup + Loading States (~6-8h)

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 9 | **Reescrever signup.tsx com design system** (Tailwind + authShell) | 3h | 🔴 Conversão |
| 10 | Adicionar campo "Confirmar senha" | 15 min | UX |
| 11 | Indicador de força de senha | 30 min | UX |
| 12 | Loading spinner em todos os botões de submit (Alpine.js) | 2h | UX global |
| 13 | Verificação de e-mail pós-signup (ou magic link) | 2h | Segurança |

### 🟢 Sprint 3 — Melhorias de Onboarding + Subscription (~4-6h)

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 14 | Upload de logo no step de branding | 2h | Onboarding |
| 15 | Botão "Pular esta etapa" em steps opcionais | 30 min | UX |
| 16 | Erro explícito quando subdomínio já existe | 30 min | UX |
| 17 | Restringir onboarding a admin/socio | 15 min | Segurança |
| 18 | Toggle mensal/anual nos planos | 1.5h | Conversão |
| 19 | Tratamento de erro fino na criação de cliente Asaas | 1h | UX |

### 🔵 Sprint 4 — Features Premium (~8-12h)

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 20 | Login social (Google OAuth) | 4h | Conversão |
| 21 | Geração de PDF de faturas | 3h | Billing |
| 22 | Envio de fatura por e-mail | 2h | Billing |
| 23 | Portal Asaas para atualização de pagamento | 2h | Subscription |

### ⏱️ Estimativa Total

| Sprint | Foco | Esforço |
|--------|------|---------|
| 🔴 Sprint 1 | Acentuação + Segurança | ~4-5h |
| 🟡 Sprint 2 | Redesign Signup + Loading | ~6-8h |
| 🟢 Sprint 3 | Onboarding + Subscription | ~4-6h |
| 🔵 Sprint 4 | Features Premium | ~8-12h |
| **Total** | | **~22-31h** |

---

> **Veredicto:** A jornada tem uma base sólida — o onboarding com barra de progresso e step indicator é excelente, o auth com 2FA e rate limiting é robusto, e o billing com wizard é bem pensado. Os dois maiores problemas são: (1) o **signup com design completamente diferente** do resto do app, criando uma quebra de confiança no momento mais crítico da conversão, e (2) a **acentuação ausente em ~80+ textos** espalhados por toda a jornada, o que é particularmente grave para um produto voltado a escritórios de advocacia. A vulnerabilidade do webhook do Asaas sem validação também precisa de atenção imediata.
