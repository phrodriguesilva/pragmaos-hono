// Marketing layout — PragmaOS product website (the SaaS landing page).
// Distinct from PublicLayout (which is per-tenant white-label sites).
// Targets B2B decision-makers: managing partners, founders, CEOs of law firms.

import type { FC, PropsWithChildren } from "hono/jsx";
import { appCss } from "../generated/css";

type NavItem = { href: string; label: string };

const NAV: NavItem[] = [
  { href: "/#recursos", label: "Recursos" },
  { href: "/#planos", label: "Planos" },
  { href: "/#depoimentos", label: "Clientes" },
  { href: "/#faq", label: "FAQ" },
  { href: "/contato", label: "Contato" },
];

export const MarketingLayout: FC<PropsWithChildren<{
  title: string;
  description?: string;
  active?: string;
  ogImage?: string;
  canonical?: string;
  noindex?: boolean;
}>> = ({ title, description, active, ogImage, canonical, noindex, children }) => {
  const desc = description ?? "PragmaOS — a plataforma de gestao juridica all-in-one para escritorios de advocacia modernos. Processos, prazos, financeiro, IA e mais.";
  const url = canonical ?? "https://pragmaos.app";
  const img = ogImage ?? "https://pragmaos.app/static/img/og-cover.png";
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#1f1d1a" />
        <title>{title}</title>
        <meta name="description" content={desc} />
        <meta name="author" content="PragmaOS" />
        <meta name="robots" content={noindex ? "noindex,nofollow" : "index,follow"} />
        {canonical ? <link rel="canonical" href={canonical} /> : null}

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="PragmaOS" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={desc} />
        <meta property="og:url" content={url} />
        <meta property="og:image" content={img} />
        <meta property="og:locale" content="pt_BR" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={desc} />
        <meta name="twitter:image" content={img} />

        {/* Structured data — SoftwareApplication */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "PragmaOS",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          description: desc,
          url: "https://pragmaos.app",
          offers: {
            "@type": "Offer",
            price: "199.00",
            priceCurrency: "BRL",
            description: "Plano Starter a partir de R$ 199/mes",
          },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.9",
            ratingCount: "120",
          },
        }) }} />

        <link rel="icon" href="/static/img/icon.svg" type="image/svg+xml" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preload" href="/static/fonts/Phosphor.woff2" as="font" type="font/woff2" crossorigin="" />
        <link rel="preload" href="/static/fonts/Phosphor-Bold.woff2" as="font" type="font/woff2" crossorigin="" />
        <style dangerouslySetInnerHTML={{ __html: appCss }} />
        <link rel="stylesheet" href="/static/css/phosphor-regular.css" />
        <link rel="stylesheet" href="/static/css/phosphor-bold.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Source+Serif+4:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet" />
        <script src="/static/js/alpine.min.js" defer />
        <style>{`
          body { font-family: 'Inter', sans-serif; }
          .font-serif { font-family: 'Source Serif 4', serif; }
          .gradient-hero { background: radial-gradient(1200px 600px at 80% -10%, rgba(176,100,50,0.25), transparent), linear-gradient(180deg, #1f1d1a 0%, #2b2925 100%); }
          .gradient-cta { background: linear-gradient(135deg, #b06432 0%, #784222 100%); }
          .text-balance { text-wrap: balance; }
          .text-pretty { text-wrap: pretty; }
        `}</style>
      </head>
      <body class="bg-white text-carvao-800 antialiased min-h-screen flex flex-col">
        {/* Header */}
        <header class="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-carvao-100">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <a href="/" class="flex items-center gap-2.5" aria-label="PragmaOS inicio">
              <div class="w-9 h-9 rounded-xl bg-terracota-500 flex items-center justify-center shrink-0">
                <i class="ph-bold ph-scales text-white text-lg" aria-hidden="true" />
              </div>
              <span class="text-lg font-bold tracking-tight text-carvao-800">PragmaOS</span>
            </a>

            <nav class="hidden md:flex items-center gap-7">
              {NAV.map((n) => (
                <a href={n.href} class={`text-sm font-medium transition-colors ${active === n.label ? "text-terracota-600" : "text-carvao-500 hover:text-carvao-800"}`}>{n.label}</a>
              ))}
            </nav>

            <div class="hidden md:flex items-center gap-3">
              <a href="/login" class="text-sm font-semibold text-carvao-600 hover:text-carvao-800 transition-colors">Entrar</a>
              <a href="/signup" class="btn btn-primary text-sm">Teste gratis</a>
            </div>

            {/* Mobile */}
            <button class="md:hidden p-2 rounded-lg hover:bg-carvao-50" {...{ "x-data": "{ open: false }", "@click": "open = !open" }} aria-label="Menu">
              <i class="ph ph-list text-xl text-carvao-600" aria-hidden="true" />
            </button>
          </div>
          <div {...{ "x-show": "open" }} x-cloak class="md:hidden border-t border-carvao-100 px-4 py-3 flex flex-col gap-3 bg-white">
            {NAV.map((n) => <a href={n.href} class="text-sm font-medium text-carvao-600 hover:text-carvao-800">{n.label}</a>)}
            <div class="flex gap-3 pt-2 border-t border-carvao-100">
              <a href="/login" class="flex-1 text-center text-sm font-semibold text-carvao-600 py-2 rounded-lg border border-carvao-200">Entrar</a>
              <a href="/signup" class="flex-1 text-center btn btn-primary text-sm py-2">Teste gratis</a>
            </div>
          </div>
        </header>

        <main class="flex-1">{children}</main>

        {/* Footer */}
        <footer class="bg-carvao-800 text-carvao-200 mt-auto">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 py-12">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div class="col-span-2 md:col-span-1">
                <div class="flex items-center gap-2.5 mb-3">
                  <div class="w-8 h-8 rounded-lg bg-terracota-500 flex items-center justify-center">
                    <i class="ph-bold ph-scales text-white text-sm" aria-hidden="true" />
                  </div>
                  <span class="text-base font-bold text-white">PragmaOS</span>
                </div>
                <p class="text-sm text-carvao-300 max-w-xs">A plataforma all-in-one de gestao juridica para escritorios que querem crescer com dados, nao com planilhas.</p>
              </div>

              <div>
                <h4 class="text-sm font-semibold text-white mb-3">Produto</h4>
                <ul class="space-y-2 text-sm">
                  <li><a href="/#recursos" class="hover:text-white transition-colors">Recursos</a></li>
                  <li><a href="/#planos" class="hover:text-white transition-colors">Planos</a></li>
                  <li><a href="/#integracoes" class="hover:text-white transition-colors">Integracoes</a></li>
                  <li><a href="/#seguranca" class="hover:text-white transition-colors">Seguranca</a></li>
                </ul>
              </div>

              <div>
                <h4 class="text-sm font-semibold text-white mb-3">Empresa</h4>
                <ul class="space-y-2 text-sm">
                  <li><a href="/sobre" class="hover:text-white transition-colors">Sobre</a></li>
                  <li><a href="/contato" class="hover:text-white transition-colors">Fale com o comercial</a></li>
                  <li><a href="/login" class="hover:text-white transition-colors">Entrar</a></li>
                  <li><a href="/signup" class="hover:text-white transition-colors">Criar conta</a></li>
                </ul>
              </div>

              <div>
                <h4 class="text-sm font-semibold text-white mb-3">Contato</h4>
                <ul class="space-y-2 text-sm">
                  <li class="flex items-center gap-2"><i class="ph ph-envelope text-carvao-400" aria-hidden="true" /><a href="mailto:comercial@pragmaos.com.br" class="hover:text-white">comercial@pragmaos.com.br</a></li>
                  <li class="flex items-center gap-2"><i class="ph ph-whatsapp-logo text-carvao-400" aria-hidden="true" /><a href="https://wa.me/5511999999999" class="hover:text-white">WhatsApp comercial</a></li>
                </ul>
              </div>
            </div>

            <div class="border-t border-carvao-700 mt-10 pt-6 flex flex-col md:flex-row justify-between gap-4 text-xs text-carvao-400">
              <p>&copy; {new Date().getFullYear()} PragmaOS. Todos os direitos reservados.</p>
              <p>Feito no Brasil para advogados brasileiros.</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
};
