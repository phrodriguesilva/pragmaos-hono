# 🔍 Auditoria Completa — Site Público do Escritório (Tenant)

> **Criado em:** 02/08/2026  
> **Escopo:** Site white-label do escritório de advocacia (tenant)  
> **Arquivos:** `public-site.tsx` (1.278 linhas), `public-layout.tsx` (186 linhas), `site-admin.tsx` (1.815 linhas)  
> **Benchmark:** Mattos Filho, Machado Meyer, Pinheiro Neto, Baptista Luz, Latham & Watkins

---

## 📊 Scorecard Executivo

| Dimensão | Nota | Status | Resumo |
|----------|:----:|:------:|--------|
| **Hero Section** | 4/10 | 🔴 | Bloco escuro genérico, sem imagem, sem impacto visual |
| **Micro-Animações** | 2/10 | 🔴 | Zero animações. Apenas hover básicos do Tailwind |
| **Design de Cards** | 5/10 | 🟡 | Genéricos, flat, sem profundidade ou hover premium |
| **Tipografia** | 6/10 | 🟡 | Boa combinação Inter + Source Serif, mas sizing fixo |
| **Sistema de Cores** | 5/10 | 🟡 | Apenas 2 variáveis CSS dinâmicas, sem escalas |
| **Aparência Geral** | 4/10 | 🔴 | Parece template Tailwind de 2020, não site premium 2026 |
| **Jornada do Usuário** | 5/10 | 🟡 | Funil funcional mas com page reloads disruptivos |
| **Arquitetura de Conteúdo** | 6/10 | 🟡 | Seções completas mas ordem sub-ótima na home |
| **Performance DB** | 3/10 | 🔴 | **8 queries sequenciais bloqueantes** na homepage |
| **Qualidade do Código** | 4/10 | 🔴 | Arquivo monolítico, muita duplicação de cards |
| **Padrões Web Modernos** | 2/10 | 🔴 | Falta scroll reveal, glassmorphism, dark mode, schema.org |
| **SEO** | 3/10 | 🔴 | Títulos idênticos, sem JSON-LD, sem sitemap |
| **Acessibilidade** | 4/10 | 🔴 | Baixo contraste, labels faltando, arrows sem aria-hidden |
| **Segurança** | 4/10 | 🔴 | XSS em artigos, sem CSRF, sem captcha |

**Nota Global: 4.1/10** — O site é funcional mas está significativamente abaixo do padrão esperado para escritórios de advocacia premium em 2026.

---

## 📋 Sumário

1. [Bugs Críticos e Quebras](#1-bugs-críticos-e-quebras)
2. [Performance — Problema Severo de Queries](#2-performance--problema-severo-de-queries)
3. [Ícones Errados e Inconsistentes](#3-ícones-errados-e-inconsistentes)
4. [Textos Sem Acentuação](#4-textos-sem-acentuação)
5. [SEO — Problemas Graves](#5-seo--problemas-graves)
6. [Design Visual — Comparação com Benchmark](#6-design-visual--comparação-com-benchmark)
7. [UX e Jornada do Visitante](#7-ux-e-jornada-do-visitante)
8. [Responsividade Mobile](#8-responsividade-mobile)
9. [Acessibilidade](#9-acessibilidade)
10. [Inconsistências Admin ↔ Site Público](#10-inconsistências-admin--site-público)
11. [Segurança](#11-segurança)
12. [Componentização e Código](#12-componentização-e-código)
13. [Padrões Web Modernos Faltantes](#13-padrões-web-modernos-faltantes)
14. [Features Novas Recomendadas](#14-features-novas-recomendadas)
15. [Plano de Execução Priorizado](#15-plano-de-execução-priorizado)

---

## 1. Bugs Críticos e Quebras

### 1.1 🚨 Paginação de artigos sem basePath
- **Arquivo:** `public-site.tsx` (L675-L677)
- **Problema:** Links "Anterior" e "Próxima" usam `/artigos?page=X` hardcoded ao invés de `${b}/artigos?page=X`. Em modo path-based (`/site/:slug/artigos`), quebra a multi-tenancy.
- **Fix:** Usar `${b}/artigos?page=...`.

### 1.2 🚨 Validação de formulário apaga dados do usuário
- **Arquivo:** `public-site.tsx` (L927-L937)
- **Problema:** Dados incompletos no contato renderizam uma página de erro genérica. Clicar "← Voltar" faz GET limpo, perdendo tudo.
- **Fix:** Re-renderizar o formulário com erros inline e dados preservados.

### 1.3 ⚠️ Conteúdo de artigo com `<br>` indevido
- **Arquivo:** `public-site.tsx` (L761)
- **Problema:** `.replace(/\n/g, "<br />")` quebra markup HTML rich-text (`<p>`, `<ul>`, `<h2>`, etc.).
- **Fix:** Se o conteúdo já é HTML, não aplicar replace.

### 1.4 ⚠️ Logo de cliente com link morto
- **Arquivo:** `public-site.tsx` (L322)
- **Problema:** `href={cl.website_url ?? "#"}` abre `#` em nova aba quando URL é null.
- **Fix:** Renderizar `<span>` sem link quando URL é null.

---

## 2. Performance — Problema Severo de Queries

### 2.1 🚨 8 Queries Sequenciais na Homepage (Waterfall N+1)
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L88-L162)
- **Problema:** A home page executa **8 `await` sequenciais** para o Supabase:

```typescript
// ATUAL — cada query espera a anterior terminar (~300-800ms total)
const { data: areas } = await supabase.from("tenant_law_areas")...     // L93
const { data: articles } = await supabase.from("articles")...          // L103
const { data: stats } = await supabase.from("site_stats")...           // L112
const { data: teamMembers } = await supabase.from("team_members")...   // L120
const { data: testimonials } = await supabase.from("testimonials")...  // L129
const { data: clients } = await supabase.from("client_logos")...       // L139
const { data: recognitions } = await supabase.from("recognitions")...  // L147
const { data: offices } = await supabase.from("offices")...            // L156
```

- **Fix:** Usar `Promise.all()`:

```typescript
// CORRIGIDO — todas as queries em paralelo (~50-100ms total)
const [areas, articles, stats, teamMembers, testimonials, clients, recognitions, offices] =
  await Promise.all([
    supabase.from("tenant_law_areas")...,
    supabase.from("articles")...,
    supabase.from("site_stats")...,
    supabase.from("team_members")...,
    supabase.from("testimonials")...,
    supabase.from("client_logos")...,
    supabase.from("recognitions")...,
    supabase.from("offices")...,
  ]);
```

- **Impacto:** 🔴 Crítico — Redução de TTFB de ~600ms para ~100ms. Melhora direta no LCP.

### 2.2 ⚠️ Imagens sem lazy loading
- **Problema:** Todos os `<img>` carregam eager. Sem `loading="lazy"`, sem `width`/`height` (causa CLS).
- **Fix:** Adicionar `loading="lazy"` abaixo do fold e dimensões explícitas.

---

## 3. Ícones Errados e Inconsistentes

### 3.1 ⚠️ Prefixo duplicado de ícones Phosphor
- **Linhas:** L195, L211, L342, L456, L507, L569, L1046
- **Problema:** `class={`ph ${icon ?? "ph-scales"}`}` gera `ph ph-scales` (duplo) ou `ph scales` (inválido).
- **Fix:** Padronizar formato no DB e no render.

### 3.2 ⚠️ Ícone de email inconsistente
- L367 usa `ph-envelope-simple`, L820 e footer usam `ph-envelope`.
- **Fix:** Padronizar para `ph-envelope`.

### 3.3 ⚠️ Checkmark como caractere de texto
- L444: Usa `"✓"` hardcoded ao invés de ícone Phosphor `ph-check-circle`.

### 3.4 ⚠️ Componente `<Icon />` existente mas nunca usado
- [`icons.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/components/icons.tsx#L6-L15) exporta `<Icon />` mas todo o site usa `<i class="ph ...">` diretamente.

---

### 4. Correções de Texto (Typos)

Existem alguns problemas menores de digitação que devem ser corrigidos:

- "Areas de atuacao" (sem acentos)
- `meta description` hardcoded no layout com "escritorio" (sem acento)
- Typo "servi-os" no rodapé

---

## 5. SEO — Problemas Graves

### 5.1 🚨 Título e `<meta description>` idênticos em TODAS as 14 páginas
- **Arquivo:** [`public-layout.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/components/public-layout.tsx#L23-L24)
- **Problema:** Sempre mostra `"{tenant.name} — {tenant.tagline ?? 'Advocacia'}"`. Artigos, equipe, áreas — tudo igual.
- O campo `meta_description` do artigo é **buscado no DB** (L699) mas **nunca usado** no `<head>`.
- **Fix:** Adicionar props `pageTitle` e `pageDescription` ao layout.

### 5.2 ⚠️ Sem OpenGraph / Twitter Cards
- Links compartilhados em redes sociais mostram thumbnail genérica e descrição vaga.
- **Fix:** Adicionar `og:title`, `og:description`, `og:image`, `og:url`, `twitter:card`.

### 5.3 ⚠️ Sem URL canônica
- Conteúdo acessível por subdomain E por path (`/site/:slug/...`) = conteúdo duplicado no Google.
- **Fix:** `<link rel="canonical">` em cada página.

### 5.4 🚨 Sem JSON-LD / Schema.org
- **Zero** dados estruturados para `LegalService`, `Attorney`, `Article`, `Organization`, `BreadcrumbList`.
- **Impacto:** Sem rich snippets no Google. Escritórios concorrentes com Schema aparecem com rating, endereço e FAQ diretamente nos resultados de busca.
- **Fix:** JSON-LD dinâmico por tipo de página.

### 5.5 ⚠️ Sem sitemap.xml e robots.txt
- **Fix:** Criar rotas dinâmicas gerando sitemap por tenant.

---

## 6. Design Visual — Comparação com Benchmark

### 6.1 Hero Section (4/10)
**Atual:** Bloco escuro (`bg-secondary`) com texto centralizado e dois botões flat.

**Benchmarks:**
- **Mattos Filho:** Split layout com foto real + gradiente lateral + selo OAB
- **Machado Meyer:** Video background sutil + números animados
- **Pinheiro Neto:** Editorial com grid assimétrico e tipografia bold

**Recomendação:**
- Adicionar suporte a imagem/vídeo de hero no admin
- Background com gradient overlay ou pattern sutil
- Selo OAB ou badge de reconhecimento inline no hero
- Botão WhatsApp direto no hero

### 6.2 Cards de Áreas de Prática (5/10)
**Atual:** `rounded-xl border border-gray-100` com ícone em caixa 12x12.

**Recomendação:**
- Hover com `-translate-y-1 shadow-2xl` (elevação)
- Ícone com background gradient
- Borda accent on hover

### 6.3 Cards de Equipe (4/10)
**Atual:** Avatar circular `w-24 h-24` que parece comentário de blog.

**Benchmarks:** Sites premium usam retrato vertical 3:4 com overlay gradiente e badge de cargo.

**Recomendação:**
- Fotos maiores, proporção retrato
- Badge de OAB e especialização
- Link direto para e-mail/WhatsApp no card

### 6.4 Seção de Depoimentos (5/10)
**Atual:** Cards brancos com estrelas e quote. Funcional mas genérico.

**Recomendação:**
- Badge de origem (Google, site, indicação)
- Foto avatar do depoente
- Design tipo "aspas" com tipografia serif grande

### 6.5 Seções Sem Vida Visual (2/10)
- Nenhuma animação de scroll reveal
- Números estáticos (sem contagem animada)
- Header sticky sem blur on scroll
- Zero micro-interações

---

## 7. UX e Jornada do Visitante

### 7.1 Funil de Conversão (5/10)

**Jornada Atual:**
```
Visitante → Home → Scroll longo → CTA "Agendar Consulta" → 
Full page load /contato → Preenche 7 campos → POST → 
Página de sucesso full-screen → Precisa clicar "Voltar ao Início"
```

**Problemas:**
1. **Navegação para /contato quebra momentum** — visitante perde interesse na page transition
2. **Formulário completo para qualquer interação** — sem opção rápida (WhatsApp com área pré-preenchida)
3. **Sucesso em página separada** — disruptivo, especialmente para newsletter

**Jornada Recomendada:**
```
Visitante → Home → Social proof imediato → CTA inline →
Drawer/modal de contato rápido (sem sair da página) →
Confirmação inline com sugestão de agendar consulta
```

### 7.2 Ordem da Homepage (5/10)

**Atual:** Trust signals (reconhecimentos, logos de clientes) estão no **fundo** da página.

**Ordem Recomendada para Conversão:**
1. ⭐ Hero + CTAs
2. ⭐ **Social Proof** (Reconhecimentos + Logos) ← mover para cima
3. Áreas de Atuação
4. Stats/Números
5. Sobre o Escritório
6. Equipe Destaque
7. Depoimentos
8. Artigos Recentes
9. Escritórios/Onde Estamos
10. CTA Final
11. Newsletter

### 7.3 Falta de WhatsApp Contextual
- O botão flutuante do WhatsApp abre `wa.me/` sem mensagem pré-preenchida.
- **Fix:** Pré-preencher com contexto: `"Olá, vim do site e gostaria de saber mais sobre [área]"`.

---

## 8. Responsividade Mobile

### 8.1 ⚠️ Botões do Hero estouram em telas pequenas
- **L175:** `flex gap-4` com dois botões de texto longo transborda em <380px.
- **Fix:** `flex-col sm:flex-row flex-wrap`.

### 8.2 ⚠️ Newsletter espremida
- **L390:** `flex gap-2` força input e botão na mesma linha em telas estreitas.
- **Fix:** `flex-col sm:flex-row`.

### 8.3 ⚠️ Grid de áreas pula breakpoint
- **L191:** `grid-cols-1 md:grid-cols-3` — pula tablet.
- **Fix:** `sm:grid-cols-2`.

### 8.4 ⚠️ Sem sticky mobile action bar
- Sites de advocacia modernos têm barra fixa no mobile: `[📞 Ligar] [💬 WhatsApp] [📅 Agendar]`.

---

## 9. Acessibilidade

| Problema | Localização | Fix |
|----------|-------------|-----|
| `text-gray-400` em `bg-secondary` = ratio ~4.1:1 (abaixo do WCAG AA 4.5:1) | L173, L215, L344 | Usar `text-gray-300` |
| Input newsletter sem `<label>` nem `aria-label` | L391 | Adicionar `aria-label="E-mail"` |
| Links "Saiba mais →" repetidos sem contexto | L245, L286, L511 | Adicionar `aria-label="Saiba mais sobre {área}"` |
| Setas `→` `←` lidas por screen readers | Múltiplas linhas | `<span aria-hidden="true">→</span>` |
| Sem focus ring em botões-link | Global | `focus-visible:ring-2 focus-visible:ring-primary` |
| Sem `alt` descritivo em avatars sem foto | L234, L1096 | Adicionar alt com nome do profissional |

---

## 10. Inconsistências Admin ↔ Site Público

| # | Problema | Impacto |
|---|---------|---------|
| 1 | Campo `icon` de Reconhecimentos **não existe** no formulário admin, mas é renderizado no site público como `r.icon ?? "ph-trophy"` | Admin não consegue configurar ícones |
| 2 | `meta_description` do artigo é salvo pelo admin mas **nunca usado** no `<head>` do site | SEO individual de artigos ignorado |
| 3 | Página `/reconhecimentos` existe mas **não aparece** na navegação (header/footer) | Conteúdo inacessível |
| 4 | `sort_order` ausente em modais de **criação** de depoimentos, logos e escritórios (defaults para 0) | Ordenação imprevisível |
| 5 | Campo `source` de depoimentos salvo mas não exibido no site | Dado coletado sem uso |

---

## 11. Segurança

| Problema | Localização | Risco |
|----------|-------------|-------|
| `dangerouslySetInnerHTML` sem sanitização XSS | [`L761`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L761) | 🔴 Alto |
| Sem CSRF token nos formulários | POST /contato, POST /newsletter | 🟡 Médio |
| Sem captcha/honeypot em formulários | Contato e newsletter | 🟡 Médio (spam) |
| Data da LGPD é `new Date()` = sempre "hoje" | [`L1208`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L1208), L1256 | 🟡 Médio (jurídico) |
| WhatsApp sem validação de country code | [`public-layout.tsx L173`](file:///Users/relterborges/documents/dev/pragmaos-2/src/components/public-layout.tsx#L173) | 🟢 Baixo |

---

## 12. Componentização e Código

### 12.1 Arquivo Monolítico
- `public-site.tsx` tem **1.278 linhas** com **14 rotas** em um único arquivo.
- Cards de área, equipe e artigos são **duplicados** entre home, listagem e detalhe.

**Recomendação:** Extrair para componentes reutilizáveis:
```
src/components/public/
├── AreaCard.tsx
├── TeamCard.tsx  
├── ArticleCard.tsx
├── SectionHeader.tsx
├── TestimonialCard.tsx
├── StatCounter.tsx
├── OfficeCard.tsx
└── ContactForm.tsx
```

### 12.2 Queries duplicadas
- Mesma query de `tenant_law_areas` é executada em `/`, `/sobre`, `/areas`, `/contato`.
- **Recomendação:** Middleware que pre-carrega dados comuns.

---

## 13. Padrões Web Modernos Faltantes

| Padrão | Status | Impacto |
|--------|:------:|---------|
| Scroll Reveal Animations (IntersectionObserver) | ❌ | Seções aparecem estaticamente, sem vida |
| Glassmorphism / Backdrop Blur | ❌ | Header e cards sem efeito premium |
| Dark Mode | ❌ | Sem suporte a preferência do sistema |
| Skeleton Loaders | ❌ | Sem indicação de carregamento |
| Smooth Scroll (`scroll-behavior: smooth`) | ❌ | Navegação por anchor salta abruptamente |
| Back to Top Button | ❌ | Artigos longos sem opção de voltar |
| Cookie Consent Banner (LGPD) | ❌ | Tem política LGPD mas sem banner de consentimento |
| JSON-LD Schema.org | ❌ | Zero dados estruturados |
| Lazy Loading de imagens | ❌ | Todas carregam eager |
| Contagem Animada de Números | ❌ | Stats aparecem sem efeito |
| Prefers-Reduced-Motion | ❌ | Sem respeito a preferências de acessibilidade |
| Favicon dinâmico por tenant | ❌ | Sempre mostra ícone PragmaOS |

---

## 14. Features Novas Recomendadas

### 14.1 Alta Prioridade (Conversão)
1. **Formulário de contato como drawer/modal** — sem sair da página
2. **WhatsApp com mensagem pré-preenchida** — contextual por área/artigo
3. **Sticky mobile action bar** — `[Ligar] [WhatsApp] [Agendar]` fixo embaixo
4. **Formulário multi-step** — 3 etapas ao invés de 7 campos de uma vez
5. **Agendamento online** — Integração com Calendly/Cal.com

### 14.2 Média Prioridade (Engajamento)
1. **Busca de artigos** — Full-text search
2. **Filtro de artigos por área** — Dropdown/tabs na listagem
3. **Botões de compartilhamento social** — LinkedIn, WhatsApp, copiar link
4. **Breadcrumbs** — Navegação contextual em sub-páginas
5. **Table of Contents (TOC)** em artigos longos
6. **Barra de progresso de leitura** em artigos

### 14.3 Baixa Prioridade (Diferenciação)
1. **Calculadoras jurídicas** — Rescisão trabalhista, simulador de honorários
2. **Lead magnets** — E-books e guias em troca de email corporativo
3. **Portal do cliente** — Botão "Área do Cliente" no header
4. **Seção ESG/Pro Bono** — Diferencial competitivo
5. **Vídeos de apresentação** — Video background no hero ou perfil dos advogados
6. **Legal Design / Visual Law** — Infográficos das áreas de prática

---

## 15. Plano de Execução Priorizado

### 🔴 Sprint 1 — Bugs Críticos e Quick Wins (~2-3h)

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 1 | Fix paginação sem basePath | 5 min | 🔴 Crítico |
| 2 | `Promise.all()` nas 8 queries da home | 30 min | 🔴 Crítico (perf) |
| 3 | Corrigir pequenos typos (acentuação) | 15 min | 🔴 Credibilidade |
| 4 | Fix typo "servi-os" → "serviços" | 1 min | 🔴 |
| 5 | Títulos/descrições dinâmicos por página | 1h | 🔴 SEO |

### 🟡 Sprint 2 — Polish Visual e UX (~8-12h)

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 7 | Padronizar prefixo de ícones | 30 min | Consistência |
| 8 | Padronizar ícone de email | 10 min | Consistência |
| 9 | Substituir ✓ por ícone Phosphor | 5 min | Consistência |
| 10 | Fix botões responsivos (hero, newsletter) | 30 min | Mobile |
| 11 | Adicionar `sm:grid-cols-2` nos grids | 15 min | Tablet |
| 12 | Fix validação de formulário (preservar dados) | 1h | UX |
| 13 | Fix link morto em logos de clientes | 10 min | UX |
| 14 | Fix `<br>` em artigos HTML | 30 min | Conteúdo |
| 15 | Re-ordenar seções da home (social proof acima) | 1h | Conversão |
| 16 | WhatsApp com mensagem pré-preenchida | 30 min | Conversão |
| 17 | Data fixa na LGPD (não `new Date()`) | 15 min | Jurídico |
| 18 | Sanitização XSS com DOMPurify | 1h | Segurança |
| 19 | Fixes de acessibilidade (labels, contraste, arrows) | 1.5h | a11y |
| 20 | Campo `icon` no admin de reconhecimentos | 30 min | Admin ↔ Público |

### 🟢 Sprint 3 — SEO e Dados Estruturados (~6-8h)

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 21 | OpenGraph + Twitter Cards dinâmicos | 2h | Social sharing |
| 22 | URL canônica | 30 min | SEO |
| 23 | JSON-LD: LegalService + Organization | 2h | Rich snippets |
| 24 | JSON-LD: Attorney (equipe) | 1h | Rich snippets |
| 25 | JSON-LD: Article (artigos) | 1h | Rich snippets |
| 26 | Sitemap.xml dinâmico | 1.5h | Indexação |
| 27 | Robots.txt | 15 min | Indexação |
| 28 | Usar `meta_description` do artigo | 15 min | SEO |

### 🔵 Sprint 4 — Modernização Visual (~12-16h)

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 29 | Scroll reveal animations (CSS/Alpine IntersectionObserver) | 3h | Wow factor |
| 30 | Contagem animada dos stats | 1h | Engajamento |
| 31 | Header com backdrop-blur on scroll | 1h | Premium feel |
| 32 | Hover elevação em cards (shadow + translate) | 1h | Premium feel |
| 33 | Extrair componentes reutilizáveis (AreaCard, etc.) | 3h | Manutenção |
| 34 | Cookie consent banner (LGPD) | 2h | Compliance |
| 35 | Smooth scroll + Back to top | 1h | UX |
| 36 | Lazy loading de imagens | 30 min | Performance |
| 37 | Favicon dinâmico por tenant | 30 min | White-label |
| 38 | Sticky mobile action bar | 2h | Conversão mobile |

### ⚪ Sprint 5 — Features de Conversão (~8-12h)

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 39 | Drawer/modal de contato rápido | 3h | Conversão |
| 40 | Formulário multi-step (3 etapas) | 3h | Conversão |
| 41 | Busca de artigos | 2h | Engajamento |
| 42 | Filtro de artigos por área | 2h | Engajamento |
| 43 | Social share buttons em artigos | 1h | Alcance |
| 44 | Breadcrumbs em sub-páginas | 1h | Navegação/SEO |
| 45 | Honeypot/captcha nos formulários | 1h | Anti-spam |

---

### ⏱️ Estimativa Total

| Sprint | Foco | Esforço | Deadline Sugerido |
|--------|------|---------|-------------------|
| 🔴 Sprint 1 | Bugs + Quick Wins | 4-6h | Imediato |
| 🟡 Sprint 2 | Polish Visual + UX | 8-12h | +2-3 dias |
| 🟢 Sprint 3 | SEO + Schema | 6-8h | +1 semana |
| 🔵 Sprint 4 | Modernização Visual | 12-16h | +2 semanas |
| ⚪ Sprint 5 | Features de Conversão | 8-12h | +3 semanas |
| **Total** | | **~38-54h** | **~3-4 semanas** |

---

> **Veredicto:** O site é funcional mas parece um template genérico de 2020. Para um SaaS que vende para escritórios de advocacia, o site de cada tenant é a **vitrine principal** do produto. Melhorar isso impacta diretamente o valor percebido do PragmaOS e a satisfação dos clientes. O Sprint 1 sozinho já resolve os problemas que causam má impressão imediata.
