# 🏗️ Planejamento de Melhorias — Site de Marketing do PragmaOS (Produto)

> **Criado em:** 02/08/2026  
> **Escopo:** `marketing.tsx` (796 linhas), `marketing-layout.tsx` (187 linhas)  
> **O que é:** O site SaaS landing page do PragmaOS, servido no domínio principal (pragmaos.app, localhost). Rotas: `/` (home), `/sobre`, `/contato`, `/robots.txt`, `/sitemap.xml`.  
> **NÃO confundir com:** `public-site.tsx` (site white-label do tenant/escritório) — esse tem auditoria própria em `AUDITORIA-SITE-ESCRITORIO.md`.

---

## 📋 Sumário

1. [Bugs e Problemas Funcionais](#1-bugs-e-problemas-funcionais)
2. [Textos sem Acentuação](#2-textos-sem-acentuação)
3. [SEO e Meta Tags](#3-seo-e-meta-tags)
4. [Conteúdo Hardcoded e Placeholders](#4-conteúdo-hardcoded-e-placeholders)
5. [UX/UI e Design](#5-uxui-e-design)
6. [Acessibilidade](#6-acessibilidade)
7. [Performance e Segurança](#7-performance-e-segurança)
8. [Features Recomendadas](#8-features-recomendadas)
9. [Plano de Execução Priorizado](#9-plano-de-execução-priorizado)

---

## 1. Bugs e Problemas Funcionais

### 1.1 🚨 Active menu errado na página `/sobre`
- **Arquivo:** `marketing.tsx` L538
- **Problema:** `active="Sobre"` é passado corretamente, mas o NAV array no `marketing-layout.tsx` L16 lista `"Sobre"` como último item. O destaque funciona, porém quando o usuário vem da home com scroll em `#recursos` o active fica em "Recursos" — navegação para `/sobre` destaca corretamente.
- **Verificar:** Testar scroll na home se o active muda sozinho (Alpine não tem scroll spy).

### 1.2 ⚠️ Validação de formulário perde dados ao redirecionar
- **Arquivo:** `marketing.tsx` L738-L739
- **Problema:** Se a validação Zod falha, o usuário é redirecionado com `c.redirect(/contato?error=...)`. O formulário reaparece vazio — os dados preenchidos são perdidos.
- **Fix:** Renderizar o formulário inline com os dados preservados ao invés de redirecionar.

### 1.3 ⚠️ XSS no parâmetro `error` do contato
- **Arquivo:** `marketing.tsx` L650
- **Problema:** `{decodeURIComponent(error)}` renderiza diretamente o conteúdo da query string sem sanitização. Um atacante pode injetar HTML/JS via `?error=<script>...`.
- **Fix:** Sanitizar ou escapar o valor antes de renderizar.

---

## 2. Textos sem Acentuação

### 2.1 🚨 Acentuação ausente em quase todos os textos hardcoded
O `marketing.tsx` tem textos hardcoded extensos (planos, features, FAQs, depoimentos, hero, about). Quase **todos** estão sem acentos/cedilhas. Isso é crítico: é o site que vende o produto para escritórios de advocacia — profissionalismo é essencial.

**Exemplos (há muitos mais):**

| Linha | Errado | Correto |
|-------|--------|---------|
| L21 | `14 dias gratis, sem cartao` | `14 dias grátis, sem cartão` |
| L26 | `Ate 3 usuarios` | `Até 3 usuários` |
| L28 | `IA juridica incluida` | `IA jurídica incluída` |
| L31 | `Comecar agora` | `Começar agora` |
| L38 | `Para escritorios iniciantes` | `Para escritórios iniciantes` |
| L65 | `Integracoes (DataJud, assinaturas)` | `Integrações (DataJud, assinaturas)` |
| L99 | `Gestao de Processos` | `Gestão de Processos` |
| L99 | `Integricao automatica` | `Integração automática` |
| L100 | `Prazos e Audiencias` / `Calculo automatico` | `Prazos e Audiências` / `Cálculo automático` |
| L101 | `Honorarios, cobrancas` | `Honorários, cobranças` |
| L102 | `jurisprudencia, redacao de pecas` | `jurisprudência, redação de peças` |
| L110 | `escritorios ativos` | `escritórios ativos` |
| L113 | `satisfacao dos clientes` | `satisfação dos clientes` |
| L137 | `Nao. O PragmaOS e 100%` | `Não. O PragmaOS é 100%` |
| L145 | `gestao juridica para escritorios` | `gestão jurídica para escritórios` |
| L153 | `Integracoes` | `Integrações` |
| L154 | `Seguranca` | `Segurança` |
| L173 | `jurisprudencia em tempo real` | `jurisprudência em tempo real` |
| L184 | `Comecar teste gratis` | `Começar teste grátis` |
| L188 | `Agendar demonstracao` | `Agendar demonstração` |
| L229 | `Seu escritorio nao deveria` | `Seu escritório não deveria` |
| L302 | `Resumos automaticos de processos` | `Resumos automáticos de processos` |
| L393 | `Preco justo` | `Preço justo` |
| L429 | `atualizacoes gratuitas` | `atualizações gratuitas` |
| L444 | `Seguranca de nivel bancario` | `Segurança de nível bancário` |
| L451 | `retensao de 30 dias` | `retenção de 30 dias` (typo) |
| L484 | `Duvidas frequentes` | `Dúvidas frequentes` |
| L486 | `Tudo que voce precisa saber` | `Tudo que você precisa saber` |
| L511 | `Pronto para transformar seu escritorio?` | `Pronto para transformar seu escritório?` |
| L541 | `Construido por quem entende` | `Construído por quem entende` |
| L551 | `Fundacao` | `Fundação` |
| L578 | `Nome e obrigatorio` | `Nome é obrigatório` |
| L602 | `ate 1 dia util` | `até 1 dia útil` |
| L713 | `politica de privacidade` | `política de privacidade` |

**Total estimado:** ~80-100 ocorrências no `marketing.tsx` + ~5 no `marketing-layout.tsx` (L115 `Teste gratis`, L145 `gestao juridica para escritorios`).

---

## 3. SEO e Meta Tags

### 3.1 ✅ Já está bom
O `marketing-layout.tsx` já tem:
- `<title>` dinâmico por rota ✅
- `<meta name="description">` dinâmico ✅
- OpenGraph completo (`og:title`, `og:description`, `og:image`, `og:url`) ✅
- Twitter Cards ✅
- JSON-LD `SoftwareApplication` ✅
- `<link rel="canonical">` ✅
- `robots.txt` ✅
- `sitemap.xml` ✅

### 3.2 ⚠️ JSON-LD com dados fictícios
- **Arquivo:** `marketing-layout.tsx` L68-L76
- **Problema:** `aggregateRating` com `ratingValue: "4.9"` e `ratingCount: "120"` são dados fabricados. O Google pode penalizar schema com dados falsos.
- **Fix:** Remover `aggregateRating` ou usar dados reais.

### 3.3 ⚠️ FAQ Schema ausente
- **Arquivo:** `marketing.tsx` L489-L504
- **Problema:** Seção FAQ existe no HTML mas não tem JSON-LD `FAQPage` schema. Isso é uma oportunidade perdida de aparecer nos rich snippets do Google.
- **Fix:** Adicionar `FAQPage` schema.

---

## 4. Conteúdo Hardcoded e Placeholders

### 4.1 ⚠️ Escritórios fictícios como social proof
- **Arquivo:** `marketing.tsx` L201-L205
- **Problema:** "Mendes & Associados", "Souza Advocacia", "Braga Lima", etc. são nomes inventados. Se o produto já tem clientes reais, usar logos/nomes reais. Se não, remover a seção.

### 4.2 ⚠️ Depoimentos fictícios
- **Arquivo:** `marketing.tsx` L116-L132
- **Problema:** "Dr. Rafael Mendes", "Dra. Carolina Souza", "Dr. Paulo Braga" são personas fictícias. Google e visitantes percebem.
- **Fix:** Usar depoimentos reais ou remover até ter.

### 4.3 ⚠️ Métricas não verificáveis
- **Arquivo:** `marketing.tsx` L109-L114
- **Problema:** `+500 escritórios`, `+50 mil processos`, `4,9/5 satisfação` — se são reais, ótimo. Se não, remove credibilidade.

### 4.4 ⚠️ Contatos placeholder
- **Arquivo:** `marketing.tsx` L620, `marketing-layout.tsx` L172
- **Problema:** WhatsApp `5511999999999` e email `comercial@pragmaos.com.br` — confirmar se são reais.

### 4.5 ⚠️ Manifest.json desalinhado
- **Arquivo:** `manifest.json`
- **Problema:** `theme_color: "#c2410c"` não corresponde ao terracota do design system (`#cc8048` / `#b06432`).
- **Fix:** Alinhar com as cores reais.

---

## 5. UX/UI e Design

### 5.1 ✅ O que está bom
O site de marketing já é significativamente melhor que o site do tenant:
- Hero com gradient radial (`gradient-hero`) e radial glow ✅
- Cards com hover interativo (`hover:border-terracota-300 hover:shadow-lg group`) ✅
- Seção IA com mock de chat e glassmorphism (`backdrop-blur`) ✅
- FAQ com accordion Alpine.js funcional ✅
- Layout responsivo `flex-col sm:flex-row` ✅
- CTA final com gradient de impacto ✅

### 5.2 ⚠️ Cards de pricing sem hover
- **Arquivo:** `marketing.tsx` L398-L426
- **Problema:** Cards de planos não têm `hover:shadow-lg` nem `hover:-translate-y-1`. O card "Pro" (highlight) tem `scale-105` estático mas sem interação.
- **Fix:** Adicionar hover elevação em todos os cards de plano.

### 5.3 ⚠️ Seção de stats sem animação de contagem
- **Arquivo:** `marketing.tsx` L214-L219
- **Problema:** Números aparecem estaticamente. Uma contagem animada (countUp) seria muito mais impactante.
- **Fix:** Adicionar contador animado com IntersectionObserver.

### 5.4 ⚠️ Sem scroll reveal animations
- **Problema:** Todas as seções aparecem instantaneamente. Falta reveal on scroll para dar vida à página.
- **Fix:** CSS `@keyframes` + IntersectionObserver ou Alpine plugin.

---

## 6. Acessibilidade

### 6.1 ⚠️ `aria-label` no botão "Teste grátis" do header
- **Arquivo:** `marketing-layout.tsx` L115
- **Problema:** Link `Teste gratis` deveria ter acento para screen readers.

### 6.2 ⚠️ Focus ring ausente em links estilizados como botão
- **Arquivo:** `marketing.tsx` L186, L419-L424
- **Problema:** Links `<a>` com estilo de botão não têm `:focus-visible` ring explícito.
- **Fix:** Garantir que `.btn` tenha `focus-visible:ring-2`.

---

## 7. Performance e Segurança

### 7.1 ⚠️ Nenhuma query async (bom!)
- O `marketing.tsx` não faz chamadas ao Supabase na maioria das rotas (tudo hardcoded). Apenas o `POST /contato` faz insert. **Performance é excelente.**

### 7.2 ⚠️ Google Fonts potencialmente duplicado
- Se `public-layout.tsx` carrega Google Fonts externamente mas `marketing-layout.tsx` usa as fontes self-hosted do `input.css` apenas — verificar se há chamada redundante.

---

## 8. Features Recomendadas

### 8.1 Alta Prioridade
1. **Scroll reveal animations** — A página é longa e bem estruturada, mas estática
2. **Contagem animada dos stats** — "+500 escritórios" deveria contar de 0 a 500
3. **FAQ Schema JSON-LD** — Rich snippets gratuitos no Google
4. **Smooth scroll** para anchors (`#recursos`, `#planos`, etc.)

### 8.2 Média Prioridade
1. **Blog/artigos** no site de marketing do produto (thought leadership, SEO)
2. **Página de changelog / novidades** — Mostra que o produto evolui
3. **Página de termos de uso e política de privacidade** do PragmaOS SaaS
4. **Chat widget ou WhatsApp flutuante** no site de marketing
5. **Comparação com concorrentes** — Tabela comparativa

### 8.3 Baixa Prioridade
1. **Dark mode**
2. **i18n** (inglês para investidores/global)
3. **Página de carreiras**
4. **Página de parceiros/integrações** detalhada

---

## 9. Plano de Execução Priorizado

### 🔴 Sprint 1 — Crítico (~3-4h)

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 1 | Corrigir acentuação em TODO o marketing.tsx (~100 ocorrências) | 2-3h | 🔴 Credibilidade |
| 2 | Corrigir acentuação no marketing-layout.tsx (~5 ocorrências) | 15 min | 🔴 Credibilidade |
| 3 | Fix XSS no parâmetro `error` do contato | 15 min | 🔴 Segurança |
| 4 | Fix validação de formulário (preservar dados) | 30 min | 🟡 UX |

### 🟡 Sprint 2 — Polish (~3-4h)

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 5 | Hover em cards de pricing | 15 min | Visual |
| 6 | FAQ Schema JSON-LD | 30 min | SEO |
| 7 | Remover/corrigir aggregateRating fictício | 10 min | SEO |
| 8 | Smooth scroll para anchors | 15 min | UX |
| 9 | Scroll reveal animations | 2h | Visual |
| 10 | Contagem animada dos stats | 1h | Visual |

### 🟢 Sprint 3 — Conteúdo (~2h)

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 11 | Substituir escritórios/depoimentos fictícios por reais (ou remover) | 30 min | Credibilidade |
| 12 | Validar métricas (500 escritórios, etc.) | 15 min | Credibilidade |
| 13 | Confirmar contatos reais (WhatsApp, email) | 5 min | Funcionalidade |
| 14 | Corrigir manifest.json theme_color | 5 min | Branding |
| 15 | Página de termos/privacidade do SaaS | 1h | Compliance |

### ⏱️ Estimativa Total

| Sprint | Foco | Esforço |
|--------|------|---------|
| 🔴 Sprint 1 | Acentuação + Bugs | ~3-4h |
| 🟡 Sprint 2 | Polish Visual + SEO | ~3-4h |
| 🟢 Sprint 3 | Conteúdo Real | ~2h |
| **Total** | | **~8-10h** |

---

> **Nota:** O site de marketing do PragmaOS já está muito à frente do site do tenant em termos de design (hero com gradient, glassmorphism na seção IA, cards interativos). O problema principal é a **acentuação massiva** que prejudica severamente a credibilidade do produto.
