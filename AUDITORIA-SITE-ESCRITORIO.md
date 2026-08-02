# 🔍 Auditoria Completa — Site Público do Escritório (Tenant)

> **Criado em:** 02/08/2026  
> **Escopo:** `public-site.tsx` (1.278 linhas), `public-layout.tsx` (186 linhas)  
> **O que é:** O site white-label do escritório de advocacia (tenant), servido quando um tenant é resolvido pelo host/subdomínio ou path `/site/:slug`. Rotas: `/` (home), `/sobre`, `/areas`, `/areas/:slug`, `/artigos`, `/artigos/:slug`, `/equipe`, `/equipe/:slug`, `/contato`, `/reconhecimentos`, `/lgpd`, `/termos`, `/newsletter`.  
> **NÃO confundir com:** `marketing.tsx` (site de marketing do PragmaOS produto) — esse tem auditoria própria em `AUDITORIA-SITE-MARKETING.md`.

---

## 📋 Sumário

1. [Bugs e Problemas Funcionais](#1-bugs-e-problemas-funcionais)
2. [Performance — Queries da Homepage](#2-performance--queries-da-homepage)
3. [Textos e Acentuação](#3-textos-e-acentuação)
4. [Ícones Inconsistentes](#4-ícones-inconsistentes)
5. [SEO e Meta Tags](#5-seo-e-meta-tags)
6. [UX/UI e Design](#6-uxui-e-design)
7. [Responsividade Mobile](#7-responsividade-mobile)
8. [Acessibilidade](#8-acessibilidade)
9. [Inconsistências Admin ↔ Site Público](#9-inconsistências-admin--site-público)
10. [Segurança](#10-segurança)
11. [Componentização e Código](#11-componentização-e-código)
12. [Padrões Web Modernos Faltantes](#12-padrões-web-modernos-faltantes)
13. [Features Recomendadas](#13-features-recomendadas)
14. [Plano de Execução Priorizado](#14-plano-de-execução-priorizado)

---

## 1. Bugs e Problemas Funcionais

### 1.1 🚨 Paginação de artigos sem basePath
- **Arquivo:** `public-site.tsx` L675-L677
- **Problema:** Links "Anterior" e "Próxima" usam `/artigos?page=X` hardcoded ao invés de `${b}/artigos?page=X`. No modo path-based (`/site/:slug/artigos`), quebra a multi-tenancy.
- **Fix:** Usar `${b}/artigos?page=...`.

### 1.2 🚨 Validação de formulário apaga dados do usuário
- **Arquivo:** `public-site.tsx` L927-L937
- **Problema:** Dados incompletos no formulário de contato renderizam uma página de erro genérica. Clicar "← Voltar" faz GET limpo, perdendo tudo que o usuário digitou.
- **Fix:** Re-renderizar o formulário com erros inline e dados preservados.

### 1.3 ⚠️ Conteúdo de artigo com `<br>` indevido
- **Arquivo:** `public-site.tsx` L761
- **Problema:** `.replace(/\n/g, "<br />")` quebra markup HTML rich-text que já contém `<p>`, `<ul>`, `<h2>`, etc.
- **Fix:** Se o conteúdo já é HTML, não aplicar replace. Verificar tipo de conteúdo antes.

### 1.4 ⚠️ Logo de cliente com link morto
- **Arquivo:** `public-site.tsx` L322
- **Problema:** `href={cl.website_url ?? "#"}` abre `#` em nova aba quando URL é null.
- **Fix:** Renderizar `<span>` sem link quando `website_url` é null.

---

## 2. Performance — Queries da Homepage

### 2.1 🚨 8 Queries Sequenciais na Homepage (Waterfall)
- **Arquivo:** `public-site.tsx` L88-L162
- **Problema:** A home page executa **8 `await` sequenciais** para o Supabase. Cada query espera a anterior terminar:

```typescript
// ATUAL — sequencial (~300-800ms total)
const { data: areas } = await supabase.from("tenant_law_areas")...          // L93
const { data: articles } = await supabase.from("articles")...               // L103
const { data: stats } = await supabase.from("site_stats")...                // L112
const { data: teamMembers } = await supabase.from("team_members")...        // L120
const { data: testimonials } = await supabase.from("testimonials")...       // L129
const { data: clients } = await supabase.from("client_logos")...             // L139
const { data: recognitions } = await supabase.from("recognitions")...       // L147
const { data: offices } = await supabase.from("offices")...                  // L156
```

- **Fix:** Usar `Promise.all()` para executar todas em paralelo:

```typescript
// CORRIGIDO — paralelo (~50-100ms total)
const [areasRes, articlesRes, statsRes, teamRes, testimonialsRes, clientsRes, recognitionsRes, officesRes] =
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

### 2.2 ⚠️ Imagens sem lazy loading
- **Problema:** Todos os `<img>` carregam eager. Sem `loading="lazy"` e sem `width`/`height` (causa CLS).
- **Fix:** Adicionar `loading="lazy"` abaixo do fold e dimensões explícitas.

---

## 3. Textos e Acentuação

### 3.1 ⚠️ Correções de Texto (Typos pontuais)
Existem problemas pontuais de digitação no `public-site.tsx`:

- L433: `"Areas de atuacao"` → `"Áreas de atuação"`
- L500: `"Em breve nossas areas de atuacao."` → `"Em breve nossas áreas de atuação."`
- Typo `"servi-os"` → `"serviços"` (rodapé / LGPD)
- `meta description` no `public-layout.tsx` L24: `"escritorio de advocacia"` → `"escritório de advocacia"`

> **Nota:** A maioria dos textos do site do tenant vêm do banco de dados (áreas, artigos, equipe, etc.), então a acentuação depende do que o admin inseriu. Apenas os textos hardcoded no código precisam de revisão.

---

## 4. Ícones Inconsistentes

### 4.1 ⚠️ Prefixo duplicado de ícones Phosphor
- **Linhas:** L195, L211, L342, L456, L507, L569, L1046
- **Problema:** `class={\`ph ${icon ?? "ph-scales"}\`}` pode gerar `ph ph-scales` (prefixo duplo). Depende de como o ícone é salvo no DB.
- **Fix:** Padronizar: ou salvar no DB sempre com prefixo completo (`ph-scales`) e renderizar `ph ${icon}`, ou salvar sem prefixo (`scales`) e renderizar `ph ph-${icon}`.

### 4.2 ⚠️ Ícone de email inconsistente
- L367 usa `ph-envelope-simple`, L820 e footer usam `ph-envelope`.
- **Fix:** Padronizar para um só.

### 4.3 ⚠️ Checkmark como caractere de texto
- L444: Usa `"✓"` hardcoded ao invés de ícone Phosphor `ph-check-circle`.

---

## 5. SEO e Meta Tags

### 5.1 🚨 Título e `<meta description>` idênticos em TODAS as páginas
- **Arquivo:** `public-layout.tsx` L23-L24
- **Problema:** Sempre mostra `"{tenant.name} — {tenant.tagline ?? 'Advocacia'}"` em todas as 14 rotas. Artigos, equipe, áreas — tudo com o mesmo título.
- O campo `meta_description` do artigo é **buscado no DB** (L699) mas **nunca usado** no `<head>`.
- **Fix:** Adicionar props `pageTitle` e `pageDescription` ao `PublicLayout` e personalizar por rota.

### 5.2 ⚠️ Sem OpenGraph / Twitter Cards
- **Arquivo:** `public-layout.tsx` — nenhuma tag OG/Twitter.
- Links compartilhados em redes sociais mostram thumbnail genérica e descrição vaga.
- **Fix:** Adicionar `og:title`, `og:description`, `og:image`, `og:url`, `twitter:card`.

### 5.3 ⚠️ Sem URL canônica
- Conteúdo acessível por subdomínio E por path (`/site/:slug/...`) = conteúdo duplicado no Google.
- **Fix:** `<link rel="canonical">` em cada página.

### 5.4 🚨 Sem JSON-LD / Schema.org
- **Zero** dados estruturados para `LegalService`, `Attorney`, `Article`, `Organization`, `BreadcrumbList`.
- **Impacto:** Sem rich snippets no Google para escritórios concorrentes que usam PragmaOS.
- **Fix:** JSON-LD dinâmico por tipo de página.

### 5.5 ⚠️ Sem sitemap.xml e robots.txt (por tenant)
- O site de marketing do PragmaOS tem, mas o site do tenant NÃO.
- **Fix:** Criar rotas dinâmicas gerando sitemap por tenant.

---

## 6. UX/UI e Design

### 6.1 Hero Section
- **Atual:** Bloco escuro (`bg-secondary`) com texto centralizado e dois botões flat. Funcional mas sem impacto visual comparado com sites de escritórios modernos (Mattos Filho, Machado Meyer).
- **Recomendação:** Suporte a imagem/vídeo de hero no admin, gradient overlay, selo OAB/reconhecimento inline.

### 6.2 Cards sem interação hover
- Cards de áreas, equipe e artigos não têm efeito de hover com elevação.
- **Fix:** Adicionar `hover:-translate-y-1 hover:shadow-lg transition`.

### 6.3 Seção de stats sem animação
- Números aparecem estaticamente.
- **Fix:** Contagem animada com IntersectionObserver.

### 6.4 Ordem da Homepage
- **Atual:** Social proof (reconhecimentos, logos de clientes) estão no fundo da página.
- **Recomendação:** Mover para logo após o hero para aumentar confiança imediata.

### 6.5 WhatsApp sem contexto
- Botão flutuante do WhatsApp (`public-layout.tsx`) abre `wa.me/` sem mensagem pré-preenchida.
- **Fix:** Pré-preencher com contexto da página atual.

---

## 7. Responsividade Mobile

### 7.1 ⚠️ Botões do Hero estouram em telas pequenas
- `flex gap-4` com dois botões de texto longo transborda em <380px.
- **Fix:** `flex-col sm:flex-row flex-wrap`.

### 7.2 ⚠️ Newsletter espremida
- `flex gap-2` força input e botão na mesma linha em telas estreitas.
- **Fix:** `flex-col sm:flex-row`.

### 7.3 ⚠️ Grid de áreas pula breakpoint
- `grid-cols-1 md:grid-cols-3` pula o breakpoint tablet.
- **Fix:** Adicionar `sm:grid-cols-2`.

### 7.4 ⚠️ Sem sticky mobile action bar
- Sites de advocacia modernos têm barra fixa no mobile: `[📞 Ligar] [💬 WhatsApp] [📅 Agendar]`.

---

## 8. Acessibilidade

| Problema | Fix |
|----------|-----|
| `text-gray-400` em `bg-secondary` = ratio ~4.1:1 (abaixo do WCAG AA) | Usar `text-gray-300` |
| Input newsletter sem `<label>` nem `aria-label` | Adicionar `aria-label="E-mail"` |
| Links "Saiba mais →" repetidos sem contexto | `aria-label="Saiba mais sobre {área}"` |
| Setas `→` `←` lidas por screen readers | `<span aria-hidden="true">→</span>` |
| Sem focus ring em botões-link | `focus-visible:ring-2` |

---

## 9. Inconsistências Admin ↔ Site Público

| # | Problema | Impacto |
|---|---------|---------|
| 1 | Campo `icon` de Reconhecimentos **não existe** no formulário admin, mas é renderizado no site como `r.icon ?? "ph-trophy"` | Admin não consegue configurar ícones |
| 2 | `meta_description` do artigo é salvo pelo admin mas **nunca usado** no `<head>` do site | SEO individual de artigos ignorado |
| 3 | Página `/reconhecimentos` existe mas **não aparece** na navegação (header/footer) | Conteúdo inacessível |
| 4 | `sort_order` ausente em modais de **criação** de depoimentos, logos e escritórios | Ordenação imprevisível |
| 5 | Campo `source` de depoimentos salvo mas não exibido no site | Dado coletado sem uso |

---

## 10. Segurança

| Problema | Risco |
|----------|-------|
| `dangerouslySetInnerHTML` sem sanitização XSS em artigos (L761) | 🔴 Alto |
| Sem CSRF token nos formulários POST /contato e POST /newsletter | 🟡 Médio |
| Sem captcha/honeypot em formulários | 🟡 Médio (spam) |
| Data da LGPD é `new Date()` = sempre "hoje" (L1208, L1256) | 🟡 Médio (jurídico) |
| WhatsApp sem validação de country code | 🟢 Baixo |

---

## 11. Componentização e Código

### 11.1 Arquivo Monolítico
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

### 11.2 Queries duplicadas
- Mesma query de `tenant_law_areas` é executada em `/`, `/sobre`, `/areas`, `/contato`.
- **Recomendação:** Middleware que pré-carrega dados comuns.

---

## 12. Padrões Web Modernos Faltantes

| Padrão | Status | Impacto |
|--------|:------:|---------|
| Scroll Reveal Animations | ❌ | Seções aparecem estaticamente |
| Glassmorphism / Backdrop Blur no header | ❌ | Header sem efeito premium |
| Smooth Scroll (`scroll-behavior: smooth`) | ❌ | Navegação por anchor salta |
| Back to Top Button | ❌ | Artigos longos sem opção de voltar |
| Cookie Consent Banner (LGPD) | ❌ | Tem política LGPD mas sem banner |
| JSON-LD Schema.org | ❌ | Zero dados estruturados |
| Lazy Loading de imagens | ❌ | Todas carregam eager |
| Contagem Animada de Números | ❌ | Stats estáticos |
| Favicon dinâmico por tenant | ❌ | Sempre mostra ícone PragmaOS |

---

## 13. Features Recomendadas

### Alta Prioridade (Conversão)
1. **WhatsApp com mensagem pré-preenchida** — contextual por área/artigo
2. **Formulário de contato como drawer/modal** — sem sair da página
3. **Sticky mobile action bar** — `[Ligar] [WhatsApp] [Agendar]`

### Média Prioridade (Engajamento)
1. **Busca de artigos** — Full-text search
2. **Filtro de artigos por área** — Dropdown/tabs
3. **Botões de compartilhamento social** em artigos
4. **Breadcrumbs** em sub-páginas

### Baixa Prioridade (Diferenciação)
1. **Calculadoras jurídicas** — simuladores
2. **Lead magnets** — E-books em troca de email
3. **Portal do cliente** — Botão "Área do Cliente" no header

---

## 14. Plano de Execução Priorizado

### 🔴 Sprint 1 — Bugs Críticos e Quick Wins (~2-3h)

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 1 | Fix paginação sem basePath | 5 min | 🔴 Crítico |
| 2 | `Promise.all()` nas 8 queries da home | 30 min | 🔴 Performance |
| 3 | Corrigir typos pontuais de acentuação | 15 min | 🔴 Credibilidade |
| 4 | Títulos/descrições dinâmicos por página (SEO) | 1h | 🔴 SEO |

### 🟡 Sprint 2 — Polish Visual e UX (~8-10h)

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 5 | Padronizar prefixo de ícones | 30 min | Consistência |
| 6 | Fix validação de formulário (preservar dados) | 1h | UX |
| 7 | Fix link morto em logos de clientes | 10 min | UX |
| 8 | Fix `<br>` em artigos HTML | 30 min | Conteúdo |
| 9 | Re-ordenar seções da home (social proof acima) | 1h | Conversão |
| 10 | WhatsApp com mensagem pré-preenchida | 30 min | Conversão |
| 11 | Data fixa na LGPD (não `new Date()`) | 15 min | Jurídico |
| 12 | Sanitização XSS com DOMPurify | 1h | Segurança |
| 13 | Fixes de acessibilidade (labels, contraste, arrows) | 1.5h | a11y |
| 14 | Campo `icon` no admin de reconhecimentos | 30 min | Admin ↔ Público |
| 15 | Fix responsividade (hero, newsletter, grids) | 30 min | Mobile |

### 🟢 Sprint 3 — SEO e Dados Estruturados (~6-8h)

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 16 | OpenGraph + Twitter Cards dinâmicos | 2h | Social sharing |
| 17 | URL canônica | 30 min | SEO |
| 18 | JSON-LD: LegalService + Organization | 2h | Rich snippets |
| 19 | JSON-LD: Attorney (equipe) | 1h | Rich snippets |
| 20 | JSON-LD: Article (artigos) | 1h | Rich snippets |
| 21 | Sitemap.xml dinâmico por tenant | 1.5h | Indexação |
| 22 | Robots.txt por tenant | 15 min | Indexação |
| 23 | Usar `meta_description` do artigo | 15 min | SEO |

### 🔵 Sprint 4 — Modernização Visual (~10-12h)

| # | Tarefa | Esforço | Impacto |
|---|--------|---------|---------|
| 24 | Scroll reveal animations | 3h | Visual |
| 25 | Contagem animada dos stats | 1h | Engajamento |
| 26 | Header com backdrop-blur on scroll | 1h | Premium |
| 27 | Hover elevação em cards | 1h | Premium |
| 28 | Cookie consent banner (LGPD) | 2h | Compliance |
| 29 | Smooth scroll + Back to top | 1h | UX |
| 30 | Lazy loading de imagens | 30 min | Performance |
| 31 | Favicon dinâmico por tenant | 30 min | White-label |
| 32 | Extrair componentes reutilizáveis | 3h | Manutenção |

### ⏱️ Estimativa Total

| Sprint | Foco | Esforço |
|--------|------|---------|
| 🔴 Sprint 1 | Bugs + Quick Wins | ~2-3h |
| 🟡 Sprint 2 | Polish + UX | ~8-10h |
| 🟢 Sprint 3 | SEO + Schema | ~6-8h |
| 🔵 Sprint 4 | Modernização Visual | ~10-12h |
| **Total** | | **~26-33h** |

---

> **Nota:** O site do tenant tem muito conteúdo dinâmico (áreas, artigos, equipe, depoimentos, etc.) vindo do banco de dados — então a qualidade dos textos e imagens depende em grande parte do que o admin do escritório insere. O que podemos melhorar no código é a **infraestrutura** (SEO, performance, componentes, Schema.org) e a **experiência visual** (animações, hover effects, responsividade).
