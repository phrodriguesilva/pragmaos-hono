# 🏗️ Planejamento de Melhorias — Site Público de Marketing (PragmaOS)

> **Criado em:** 02/08/2026  
> **Escopo:** Arquivos `public-site.tsx`, `public-layout.tsx`, `marketing-layout.tsx`, `marketing.tsx`, `icons.tsx`, `base.tsx`  
> **Objetivo:** Corrigir bugs, inconsistências, ícones errados, problemas de UX/UI, SEO, acessibilidade e texto — elevando o site a um padrão profissional premium.

---

## 📋 Sumário

- [Fase 1 — Bugs Críticos e Quebras Funcionais](#fase-1--bugs-críticos-e-quebras-funcionais)
- [Fase 2 — Inconsistências de Ícones e Componentes](#fase-2--inconsistências-de-ícones-e-componentes)
- [Fase 3 — Textos e Acentuação (Qualidade do Copy)](#fase-3--textos-e-acentuação-qualidade-do-copy)
- [Fase 4 — SEO e Meta Tags](#fase-4--seo-e-meta-tags)
- [Fase 5 — UX/UI e Design Responsivo](#fase-5--uxui-e-design-responsivo)
- [Fase 6 — Acessibilidade (a11y)](#fase-6--acessibilidade-a11y)
- [Fase 7 — Inconsistências Admin ↔ Site Público](#fase-7--inconsistências-admin--site-público)
- [Fase 8 — Features Faltantes (Marketing)](#fase-8--features-faltantes-marketing)
- [Fase 9 — Conteúdo Hardcoded e Placeholders](#fase-9--conteúdo-hardcoded-e-placeholders)
- [Fase 10 — Performance e Segurança](#fase-10--performance-e-segurança)
- [Priorização e Estimativas](#priorização-e-estimativas)

---

## Fase 1 — Bugs Críticos e Quebras Funcionais

Bugs que causam mau funcionamento direto para o usuário final.

### 1.1 🚨 Menu mobile quebrado (Alpine.js scope)
- **Arquivos:** [`public-layout.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/components/public-layout.tsx#L78-L84), [`marketing-layout.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/components/marketing-layout.tsx#L121-L125)
- **Problema:** `x-data="{ open: false }"` está declarado no `<button>` (L78/L121), mas o `<div x-show="open">` do menu mobile é um **elemento irmão**, fora do escopo Alpine. O botão hamburger **não abre o menu** em dispositivos móveis.
- **Correção:** Mover `x-data="{ open: false }"` para o elemento `<header>` pai.

### 1.2 🚨 Links de paginação sem basePath (multi-tenancy quebrada)
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L675-L677)
- **Problema:** Links "Anterior" e "Próxima" estão hardcoded como `/artigos?page=X` ao invés de `${b}/artigos?page=X`. No modo path-based (`/site/:slug/artigos`), o usuário é redirecionado para fora do contexto do tenant.
- **Correção:** Usar `${b}/artigos?page=...` nos hrefs de paginação.

### 1.3 🚨 Active menu errado na página `/sobre` (marketing)
- **Arquivo:** [`marketing.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/marketing.tsx#L538)
- **Problema:** A rota `/sobre` passa `active="Clientes"`, destacando incorretamente o item "Clientes" no header ao invés de "Sobre".
- **Correção:** Alterar para `active="Sobre"` ou adicionar "Sobre" à lista `NAV`.

### 1.4 🚨 Erro de validação no formulário perde dados do usuário
- **Arquivo:** [`marketing.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/marketing.tsx#L730-L732)
- **Problema:** Falha na validação Zod redireciona para `/contato` sem mensagem de erro e sem preservar campos preenchidos.
- **Correção:** Renderizar formulário com mensagem de erro inline e valores previamente digitados.

### 1.5 🚨 Validação do formulário de contato público
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L927-L937)
- **Problema:** Dados incompletos retornam uma página genérica de erro que apaga todos os campos preenchidos.
- **Correção:** Re-renderizar o formulário com mensagens de erro inline, mantendo os dados inseridos.

---

## Fase 2 — Inconsistências de Ícones e Componentes

### 2.1 ⚠️ Prefixo duplicado de ícones Phosphor (classes CSS inválidas)
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L195) (L195, L211, L342, L456, L507, L569, L1046)
- **Problema:** Ícones do banco de dados são renderizados como `` `ph ${icon ?? "ph-scales"}` ``, resultando em classes como `ph ph-scales` (duplicando o prefixo `ph`) ou `ph scales` (class inválida). O resultado depende de como o ícone é salvo no DB.
- **Correção:** Padronizar: ou salvar ícones no DB sempre **com** prefixo completo (ex: `ph-scales`) e renderizar `ph ${icon}`, ou salvar **sem** prefixo (ex: `scales`) e renderizar `ph ph-${icon}`.

### 2.2 ⚠️ Ícone de email inconsistente
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L367) vs [L820](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L820)
- **Problema:** `ph-envelope-simple` (L367 — escritórios) vs `ph-envelope` (L820 — contato e footer). Deveria ser o mesmo ícone.
- **Correção:** Padronizar para `ph-envelope` em todo o site.

### 2.3 ⚠️ Checkmark como texto ao invés de ícone
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L444)
- **Problema:** Usa o caractere `"✓"` (hardcoded) no card de "Atendimento online" ao invés de usar um ícone Phosphor (`ph-check-circle`).
- **Correção:** Substituir por `<i class="ph ph-check-circle text-3xl text-primary" />`.

### 2.4 ⚠️ Componente `<Icon />` definido mas nunca utilizado
- **Arquivo:** [`icons.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/components/icons.tsx#L6-L15)
- **Problema:** O helper `<Icon />` é exportado mas todos os arquivos usam `<i class="ph ...">` diretamente.
- **Correção:** Decidir entre: (a) adotar `<Icon />` em todo o codebase para consistência, ou (b) remover o componente não utilizado.

### 2.5 ⚠️ Estilização inconsistente de botões CTA
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L176-L181) vs [L392](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L392)
- **Problema:** Alguns CTAs usam a classe `btn btn-primary` e outros usam classes utilitárias inline (`bg-primary text-white px-6 py-3 rounded-lg...`), resultando em aparência inconsistente.
- **Correção:** Padronizar todos os CTAs usando as classes de componente `.btn .btn-primary`.

---

## Fase 3 — Textos e Acentuação (Qualidade do Copy)

### 3.1 🚨 Acentuação ausente em TODO o site público
- **Arquivos:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx), [`public-layout.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/components/public-layout.tsx)
- **Problema:** Textos em português estão sem acentos e caracteres especiais em **dezenas de ocorrências**. Exemplos:

| Linha | Errado | Correto |
|-------|--------|---------|
| L180, L189, L433, L494 | `Areas de Atuacao` | `Áreas de Atuação` |
| L190, L812, L1010 | `voce` | `você` |
| L254 | `Escritorio` | `Escritório` |
| L256 | `solucoes juridicas` | `soluções jurídicas` |
| L260, L1084 | `Conheca` | `Conheça` |
| L269 | `Ultimos Artigos` | `Últimos Artigos` |
| L377 | `ajuda juridica?` | `ajuda jurídica?` |
| L389, L640 | `conteudos juridicos` | `conteúdos jurídicos` |
| L427 | `experiencia` | `experiência` |
| L466, L856 | `Endereco` | `Endereço` |
| L544 | `Area nao encontrada` | `Área não encontrada` |
| L676 | `Pagina` | `Página` |
| L677 | `Proxima` | `Próxima` |
| L713 | `Artigo nao encontrado` | `Artigo não encontrado` |
| L978 | `possivel` | `possível` |
| L1009 | `Inscricao` | `Inscrição` |
| L1038 | `premiacoes sao` | `premiações são` |
| L1134 | `Profissional nao encontrado` | `Profissional não encontrado` |
| L1208, L1256 | `Ultima atualizacao` | `Última atualização` |

- **E muitas outras** nos textos da Política de Privacidade (L1212–L1273) e Termos de Uso.

### 3.2 ⚠️ Typo na Política de Privacidade
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L1212)
- **Problema:** `"servi-os"` → deveria ser `"serviços"`.

### 3.3 ⚠️ Acentuação no layout público  
- **Arquivo:** [`public-layout.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/components/public-layout.tsx#L69-L90)
- **Problema:** Links de navegação no header e footer sem acentos: `"Areas de Atuacao"`, `"Inicio"`, `"Navegacao"`, `"Politica de Privacidade"`.

---

## Fase 4 — SEO e Meta Tags

### 4.1 🚨 Título e descrição idênticos em TODAS as páginas
- **Arquivo:** [`public-layout.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/components/public-layout.tsx#L23-L24)
- **Problema:** Todas as 14 rotas compartilham o mesmo `<title>` e `<meta name="description">`. Artigos, equipe e áreas de prática não têm títulos individuais. O `meta_description` do artigo é buscado no DB (L699) mas **nunca usado** no `<head>`.
- **Correção:** Adicionar props `pageTitle` e `pageDescription` ao `PublicLayout` e personalizar por rota.

### 4.2 ⚠️ Falta de OpenGraph e Twitter Cards
- **Arquivo:** [`public-layout.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/components/public-layout.tsx#L20-L50)
- **Problema:** Sem tags `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, e sem Twitter card metadata.
- **Correção:** Adicionar meta tags OG/Twitter dinâmicas, especialmente para artigos.

### 4.3 ⚠️ Falta de URL canônica
- **Problema:** Sem `<link rel="canonical">`. Com routing por subdomain E por path (`/site/:slug`), o mesmo conteúdo pode ser indexado em URLs diferentes.
- **Correção:** Adicionar tag canônica em cada página.

### 4.4 ⚠️ Falta de dados estruturados (JSON-LD)
- **Problema:** Sem schema.org para `LegalService`, `Attorney`, `Article`, `BreadcrumbList`, `Organization`.
- **Correção:** Adicionar JSON-LD dinâmico por tipo de página.

### 4.5 ⚠️ Falta de sitemap.xml e robots.txt
- **Problema:** Nenhuma rota `/sitemap.xml` ou `/robots.txt` é exposta pelo site público.
- **Correção:** Criar rotas dinâmicas que geram sitemap baseado no conteúdo publicado do tenant.

---

## Fase 5 — UX/UI e Design Responsivo

### 5.1 ⚠️ Botões do hero overflow em telas pequenas
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L175-L182)
- **Problema:** `flex gap-4 justify-center` com dois botões de texto longo (ex: "Fale Conosco" + "Áreas de Atuação") estoura em telas <380px.
- **Correção:** Adicionar `flex-col sm:flex-row flex-wrap` no container.

### 5.2 ⚠️ Newsletter form espremido no mobile
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L390)
- **Problema:** `flex gap-2` força input e botão na mesma linha em telas estreitas.
- **Correção:** Adicionar `flex-col sm:flex-row`.

### 5.3 ⚠️ Grid de áreas pula de 1 para 3 colunas
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L191)
- **Problema:** `grid-cols-1 md:grid-cols-3` pula o breakpoint tablet.
- **Correção:** Adicionar `sm:grid-cols-2`.

### 5.4 ⚠️ Newsletter e contato com UX disruptiva
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L990-L1017)
- **Problema:** `POST /newsletter` redireciona para uma página de confirmação full-screen, tirando o usuário do contexto. O ideal seria feedback inline na própria seção.
- **Correção:** Usar JavaScript para submissão assíncrona (fetch) ou ao menos renderizar a mesma homepage com banner de sucesso.

### 5.5 ⚠️ Logo dos clientes com link morto
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L322)
- **Problema:** `href={cl.website_url ?? "#"}` — quando `website_url` é null, o link aponta para `#` abrindo em nova aba.
- **Correção:** Renderizar `<span>` sem link quando `website_url` é null.

### 5.6 ⚠️ Dados do artigo `content` com `<br>` indevido
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L761)
- **Problema:** `.replace(/\n/g, "<br />")` quebra markup HTML rich-text que já contém `<p>`, `<ul>`, `<h2>`, etc.
- **Correção:** Se o conteúdo já for HTML, não aplicar replace; se for texto puro, converter adequadamente.

---

## Fase 6 — Acessibilidade (a11y)

### 6.1 ⚠️ Contraste de cor insuficiente
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L215) (L173, L215, L319, L344)
- **Problema:** `text-gray-400` sobre `bg-secondary` (#2b2925) tem ratio ~4.1:1, falhando WCAG AA (mínimo 4.5:1).
- **Correção:** Usar `text-gray-300` ou mais claro nas seções escuras.

### 6.2 ⚠️ Input de newsletter sem label
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L391)
- **Problema:** `<input type="email">` não tem `<label>` nem `aria-label`. Screen readers dependem apenas do placeholder.
- **Correção:** Adicionar `aria-label="E-mail"` ou `<label>` visualmente escondido.

### 6.3 ⚠️ Textos de link repetitivos e genéricos
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L511) (L245, L260, L286, L511)
- **Problema:** Links "Saiba mais →" repetidos sem `aria-label` descritivo. Screen readers anunciam múltiplos links idênticos.
- **Correção:** Adicionar `aria-label="Saiba mais sobre {nome da área}"`.

### 6.4 ⚠️ Setas decorativas lidas por screen readers
- **Arquivo:** Múltiplas linhas (L245, L260, L511, L675, L677, L714, etc.)
- **Problema:** Caracteres `→` e `←` são anunciados como "seta para direita" por screen readers.
- **Correção:** Envolver em `<span aria-hidden="true">→</span>`.

### 6.5 ⚠️ Falta de focus ring em botões-link
- **Problema:** Tags `<a>` estilizadas como botões (`.btn`) não têm indicador `:focus-visible` explícito para navegação por teclado.
- **Correção:** Adicionar `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2` nos estilos `.btn`.

---

## Fase 7 — Inconsistências Admin ↔ Site Público

### 7.1 🚨 Campo `icon` de Reconhecimentos não existe no admin
- **Admin:** [`site-admin.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/site-admin.tsx) — Formulário de reconhecimentos NÃO tem input para `icon`.
- **Público:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L342) — Renderiza `r.icon ?? "ph-trophy"`.
- **Correção:** Adicionar campo de ícone no modal de reconhecimentos do admin.

### 7.2 ⚠️ `meta_description` de artigos é salvo mas nunca usado
- **Admin:** Permite editar `meta_description` para cada artigo.
- **Público:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L699) busca o campo, mas **não passa** para o `PublicLayout`.
- **Correção:** Passar como prop `pageDescription` ao layout.

### 7.3 ⚠️ Página `/reconhecimentos` sem link na navegação
- **Problema:** A rota `GET /reconhecimentos` existe mas não aparece no header/footer do `PublicLayout`.
- **Correção:** Adicionar link na navegação ou criar seção dropdown "Sobre" com sub-links.

### 7.4 ⚠️ `sort_order` ausente em modais de criação do admin
- **Problema:** Modais de criação de Depoimentos, Logos de Clientes e Escritórios omitem campo `sort_order`, usando default 0.
- **Correção:** Adicionar input de `sort_order` nos formulários de criação.

### 7.5 ⚠️ Campo `source` de depoimentos salvo mas não exibido
- **Admin:** Permite selecionar `source` (website, google, manual).
- **Público:** Não exibe de onde veio o depoimento.
- **Correção:** Opcionalmente exibir badge de origem.

---

## Fase 8 — Features Faltantes (Marketing)

### 8.1 Busca de conteúdo
- Nenhum input de busca para artigos ou áreas de prática.
- **Recomendação:** Adicionar busca full-text na listagem de artigos.

### 8.2 Filtro de artigos por área de prática
- `/artigos` lista todos os artigos linearmente.
- **Recomendação:** Adicionar dropdown/tabs de filtro por área.

### 8.3 Botões de compartilhamento social
- Artigos não têm botões de share (LinkedIn, WhatsApp, X/Twitter, copiar link).
- **Recomendação:** Adicionar social share bar nos artigos.

### 8.4 Breadcrumbs
- Páginas internas (`/areas/:slug`, `/artigos/:slug`, `/equipe/:slug`) não têm breadcrumb.
- **Recomendação:** Adicionar breadcrumb navigation abaixo do header.

### 8.5 Proteção contra spam
- Formulários de contato e newsletter sem CAPTCHA, honeypot ou rate limiting.
- **Recomendação:** Adicionar Cloudflare Turnstile ou honeypot field.

### 8.6 Banner de consentimento de cookies (LGPD)
- Nenhum banner de cookies apesar da página de política LGPD existir.
- **Recomendação:** Implementar banner de consentimento.

### 8.7 Mapa interativo para escritórios
- Endereços são texto puro sem link para Google Maps.
- **Recomendação:** Adicionar link "Ver no Google Maps" ou embed leve.

### 8.8 WhatsApp no hero
- Hero tem apenas "Fale Conosco" e "Áreas de Atuação".
- **Recomendação:** Adicionar CTA direto para WhatsApp quando disponível.

---

## Fase 9 — Conteúdo Hardcoded e Placeholders

### 9.1 ⚠️ Data dinâmica na Política de Privacidade e Termos
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L1208) (L1208, L1256)
- **Problema:** `new Date().toLocaleDateString("pt-BR")` mostra a data de HOJE como "última atualização", criando uma informação jurídica falsa.
- **Correção:** Usar data fixa ou salvar `last_policy_update_date` no tenant.

### 9.2 ⚠️ Dados hardcoded no marketing.tsx (PragmaOS product site)
- **Arquivo:** [`marketing.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/marketing.tsx)
- **Itens hardcoded:**
  - JSON-LD com preço `R$ 199,00`, rating `4.9`, count `120`
  - Nomes fictícios de escritórios ("Mendes & Associados", "Souza Advocacia", etc.)
  - Depoimentos com nomes de advogados fictícios
  - Email `comercial@pragmaos.com.br`
  - WhatsApp `5511999999999`
  - Métricas `+500 escritórios`, `+50 mil processos`
- **Correção:** Considerar tornar dados de social proof reais ou marcar claramente como demonstrativos.

### 9.3 ⚠️ Favicon aponta para ícone genérico PragmaOS
- **Arquivo:** [`public-layout.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/components/public-layout.tsx#L25)
- **Problema:** `<link rel="icon" href="/static/img/icon.svg">` é o ícone do PragmaOS, não do escritório/tenant.
- **Correção:** Usar favicon do tenant quando disponível.

### 9.4 ⚠️ Manifest.json com dados genéricos
- **Arquivo:** [`manifest.json`](file:///Users/relterborges/documents/dev/pragmaos-2/public/manifest.json)
- **Problema:** `theme_color: "#c2410c"` não corresponde às cores do tema Carvão/Terracota (`#cc8048`).
- **Correção:** Alinhar com as cores do design system.

---

## Fase 10 — Performance e Segurança

### 10.1 ⚠️ Google Fonts carregado externamente
- **Arquivo:** [`public-layout.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/components/public-layout.tsx#L31-L33)
- **Problema:** Inter e Source Serif 4 são carregados via Google Fonts CDN, mas as fontes **já existem** como arquivos locais em `/static/fonts/`.
- **Correção:** Remover chamadas ao Google Fonts e usar apenas as fontes self-hosted (já declaradas em `input.css`).

### 10.2 ⚠️ Registro do Service Worker silencia erros
- **Arquivo:** [`base.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/layouts/base.tsx#L67)
- **Problema:** `.catch(() => {})` engole erros de registro do SW.
- **Correção:** Pelo menos logar warning no console.

### 10.3 ⚠️ `dangerouslySetInnerHTML` sem sanitização
- **Arquivo:** [`public-site.tsx`](file:///Users/relterborges/documents/dev/pragmaos-2/src/routes/public-site.tsx#L761)
- **Problema:** Conteúdo de artigos renderizado com `dangerouslySetInnerHTML` sem sanitização XSS.
- **Correção:** Sanitizar HTML com uma biblioteca como DOMPurify antes de renderizar.

### 10.4 ⚠️ Missing JSX `key` props em loops `.map()`
- **Arquivos:** Múltiplos (praticamente todos os `.map()` no site)
- **Problema:** Nenhum loop `.map()` fornece `key` prop nos elementos JSX.
- **Correção:** Adicionar `key` com ID ou index em todos os loops.

---

## Priorização e Estimativas

### 🔴 Prioridade ALTA (Corrigir Imediatamente)

| # | Item | Esforço | Impacto |
|---|------|---------|---------|
| 1.1 | Menu mobile quebrado (Alpine scope) | 15 min | **Crítico** — Mobile inacessível |
| 1.2 | Paginação sem basePath | 5 min | **Crítico** — Multi-tenancy quebrada |
| 3.1 | Acentuação ausente em todo o site | 2h | **Alto** — Profissionalismo |
| 4.1 | Títulos/descrições idênticos | 1h | **Alto** — SEO |
| 2.1 | Prefixo duplicado de ícones | 30 min | **Alto** — Ícones potencialmente invisíveis |

### 🟡 Prioridade MÉDIA (Próximo Sprint)

| # | Item | Esforço | Impacto |
|---|------|---------|---------|
| 1.3 | Active menu errado `/sobre` | 5 min | Médio |
| 1.4, 1.5 | Validação de formulários | 1h | Médio |
| 2.2–2.5 | Inconsistências de ícones/componentes | 30 min | Médio |
| 5.1–5.3 | Responsividade mobile | 30 min | Médio |
| 5.4 | Newsletter UX disruptiva | 1h | Médio |
| 5.6 | Content replace `<br>` | 30 min | Médio |
| 6.1–6.5 | Acessibilidade | 2h | Médio |
| 7.1–7.5 | Inconsistências admin ↔ público | 2h | Médio |
| 9.1 | Data dinâmica LGPD | 15 min | Médio |
| 10.3 | Sanitização XSS | 1h | Médio — Segurança |

### 🟢 Prioridade BAIXA (Backlog)

| # | Item | Esforço | Impacto |
|---|------|---------|---------|
| 4.2–4.5 | OG tags, canonical, JSON-LD, sitemap | 4h | Melhoria SEO |
| 8.1–8.8 | Features novas | 8-16h | Melhoria UX |
| 9.2–9.4 | Conteúdo hardcoded | 1h | Cosmético |
| 10.1, 10.2, 10.4 | Performance e cleanup | 1h | Otimização |

---

### ⏱️ Estimativa Total

| Grupo | Estimativa |
|-------|-----------|
| 🔴 Alta Prioridade | ~4h |
| 🟡 Média Prioridade | ~9h |
| 🟢 Baixa Prioridade | ~14-22h |
| **Total** | **~27-35h** |

---

> **Próximo passo:** Começar pela **Fase 1** (bugs críticos) e **Fase 3** (acentuação) que são os itens de maior impacto com menor esforço. Esses fixes sozinhos já elevam significativamente a qualidade percebida do site.
