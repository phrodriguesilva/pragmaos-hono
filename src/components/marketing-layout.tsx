// Marketing layout — PragmaOS product website (the SaaS landing page).
// Lexis Modern design system: Plus Jakarta Sans, navy primary, light surfaces.
// Incorporates cinematic scroll animations via IntersectionObserver + CSS.

import type { FC, PropsWithChildren } from "hono/jsx";
import { appCss } from "../generated/css";

type NavItem = { href: string; label: string };

const NAV: NavItem[] = [
  { href: "/#recursos", label: "Recursos" },
  { href: "/#planos", label: "Planos" },
  { href: "/#depoimentos", label: "Clientes" },
  { href: "/#faq", label: "FAQ" },
  { href: "/contato", label: "Contato" },
  { href: "/sobre", label: "Sobre" },
];

export const MarketingLayout: FC<PropsWithChildren<{
  title: string;
  description?: string;
  active?: string;
  ogImage?: string;
  canonical?: string;
  noindex?: boolean;
  jsonLd?: object;
}>> = ({ title, description, active, ogImage, canonical, noindex, jsonLd, children }) => {
  const desc = description ?? "PragmaOS — a plataforma de gestão jurídica all-in-one para escritórios de advocacia modernos. Processos, prazos, financeiro, IA e mais.";
  const url = canonical ?? "https://pragmaos.app";
  const img = ogImage ?? "https://pragmaos.app/static/img/og-cover.png";
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#05111e" />
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
            description: "Plano Starter a partir de R$ 199/mês",
          },
        }) }} />

        {/* Additional page-specific JSON-LD (e.g. FAQPage) */}
        {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}

        <link rel="icon" href="/static/img/icon.svg" type="image/svg+xml" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preload" href="/static/fonts/Phosphor.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
        <link rel="preload" href="/static/fonts/Phosphor-Bold.woff2" as="font/woff2" crossorigin="anonymous" />
        <link rel="preload" href="/static/fonts/PlusJakartaSans-700.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
        <link rel="preload" href="/static/fonts/PlusJakartaSans-400.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
        <style dangerouslySetInnerHTML={{ __html: appCss }} />
        <link rel="stylesheet" href="/static/css/phosphor-regular.css" />
        <link rel="stylesheet" href="/static/css/phosphor-bold.css" />
        <script src="/static/js/alpine.min.js" defer />
        <style dangerouslySetInnerHTML={{ __html: `
          /* === Lexis Modern marketing styles === */
          .mkt-body {
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
            background: #f7fafc;
            color: #181c1e;
          }
          .mkt-body * {
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          }
          .mkt-body .font-serif {
            font-family: 'Source Serif 4', Georgia, serif;
          }

          /* === Scroll animations (cinematic, motionsites-inspired) === */
          .reveal {
            opacity: 0;
            transform: translateY(28px);
            transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .reveal.revealed {
            opacity: 1;
            transform: translateY(0);
          }
          .reveal-stagger > * {
            opacity: 0;
            transform: translateY(24px) scale(0.97);
            transition: opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1), transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
          }
          .reveal-stagger.revealed > * {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          .reveal-stagger.revealed > *:nth-child(1) { transition-delay: 0ms; }
          .reveal-stagger.revealed > *:nth-child(2) { transition-delay: 80ms; }
          .reveal-stagger.revealed > *:nth-child(3) { transition-delay: 160ms; }
          .reveal-stagger.revealed > *:nth-child(4) { transition-delay: 240ms; }
          .reveal-stagger.revealed > *:nth-child(5) { transition-delay: 320ms; }
          .reveal-stagger.revealed > *:nth-child(6) { transition-delay: 400ms; }
          .reveal-stagger.revealed > *:nth-child(7) { transition-delay: 480ms; }
          .reveal-stagger.revealed > *:nth-child(8) { transition-delay: 560ms; }

          /* Pull-up word animation for headings */
          .pull-up {
            opacity: 0;
            transform: translateY(20px);
            transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .pull-up.revealed {
            opacity: 1;
            transform: translateY(0);
          }

          /* Scroll-linked character opacity (progressive text reveal) */
          .scroll-text { color: #44474c; }
          .scroll-text .char {
            opacity: 0.15;
            transition: opacity 0.1s linear;
          }

          @media (prefers-reduced-motion: reduce) {
            .reveal, .reveal-stagger > *, .pull-up {
              opacity: 1 !important;
              transform: none !important;
              transition: none !important;
            }
            .scroll-text .char { opacity: 1 !important; }
            html { scroll-behavior: auto; }
          }

          html { scroll-behavior: smooth; }

          /* Noise texture overlay (subtle, from motionsites) */
          .noise-overlay {
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E");
          }
          .bg-noise {
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
          }

          /* Hero gradient — navy cinematic */
          .gradient-hero-navy {
            background: radial-gradient(1200px 600px at 80% -10%, rgba(26, 38, 52, 0.15), transparent),
                        linear-gradient(180deg, #05111e 0%, #0a1929 50%, #05111e 100%);
          }
          .gradient-cta-navy {
            background: linear-gradient(135deg, #05111e 0%, #1a2634 100%);
          }

          /* Card hover depth (tonal, Lexis Modern) */
          .card-lexis {
            background: #ffffff;
            border: 1px solid #e0e3e5;
            border-radius: 12px;
            transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
          }
          .card-lexis:hover {
            border-color: #1a2634;
            box-shadow: 0 20px 40px -15px rgba(5, 17, 33, 0.08);
            transform: translateY(-2px);
          }

          /* Focus visible */
          .mkt-body a:focus-visible, .mkt-body button:focus-visible {
            outline: 2px solid #1a2634;
            outline-offset: 2px;
          }
        ` }} />
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            // IntersectionObserver for reveal animations
            const revealObs = new IntersectionObserver((entries) => {
              entries.forEach(e => {
                if (e.isIntersecting) {
                  e.target.classList.add('revealed');
                  revealObs.unobserve(e.target);
                }
              });
            }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

            // Stagger observer (triggers when container enters viewport)
            const staggerObs = new IntersectionObserver((entries) => {
              entries.forEach(e => {
                if (e.isIntersecting) {
                  e.target.classList.add('revealed');
                  staggerObs.unobserve(e.target);
                }
              });
            }, { threshold: 0.1, rootMargin: '0px 0px -100px 0px' });

            // Scroll-linked character opacity (progressive text reveal)
            function setupScrollText() {
              document.querySelectorAll('.scroll-text').forEach(el => {
                const chars = el.querySelectorAll('.char');
                if (!chars.length) return;
                const updateOpacity = () => {
                  const rect = el.getBoundingClientRect();
                  const winH = window.innerHeight;
                  const progress = (winH - rect.top) / (winH + rect.height);
                  const clamped = Math.max(0, Math.min(1, progress));
                  chars.forEach((c, i) => {
                    const charProgress = i / chars.length;
                    const charOpacity = Math.max(0.15, Math.min(1, (clamped - charProgress + 0.1) * 5));
                    c.style.opacity = charOpacity;
                  });
                };
                updateOpacity();
                window.addEventListener('scroll', updateOpacity, { passive: true });
                window.addEventListener('resize', updateOpacity);
              });
            }

            // Animated stat counters
            const statObs = new IntersectionObserver((entries) => {
              entries.forEach(e => {
                if (!e.isIntersecting) return;
                const el = e.target;
                const raw = el.dataset.value || "";
                statObs.unobserve(el);
                const m = raw.match(/(\\+?)(\\d+[\\.,]?\\d*)(.*)/);
                if (!m) return;
                const prefix = m[1] || "";
                const numStr = m[2];
                const suffix = m[3] || "";
                const target = parseFloat(numStr.replace(",", "."));
                const isFloat = numStr.includes(",") || numStr.includes(".");
                const duration = 1200;
                const start = performance.now();
                const step = (now) => {
                  const p = Math.min((now - start) / duration, 1);
                  const eased = 1 - Math.pow(1 - p, 3);
                  const val = target * eased;
                  const formatted = isFloat ? val.toFixed(1).replace(".", ",") : Math.round(val).toString();
                  el.textContent = prefix + formatted + suffix;
                  if (p < 1) requestAnimationFrame(step);
                  else el.textContent = raw;
                };
                requestAnimationFrame(step);
              });
            }, { threshold: 0.5 });

            document.addEventListener('DOMContentLoaded', () => {
              document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));
              document.querySelectorAll('.reveal-stagger').forEach(el => staggerObs.observe(el));
              document.querySelectorAll('.pull-up').forEach(el => revealObs.observe(el));
              document.querySelectorAll('.stat-counter').forEach(el => statObs.observe(el));
              setupScrollText();
            });
          })();
        ` }} />
      </head>
      <body class="mkt-body bg-[#f7fafc] text-[#181c1e] antialiased min-h-screen flex flex-col">
        {/* Header — sticky, tonal, minimal */}
        <header {...{ "x-data": "{ open: false }" }} class="sticky top-0 z-50 bg-[#f7fafc]/90 backdrop-blur-md border-b border-[#c4c6cc]">
          <div class="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <a href="/" class="flex items-center gap-2.5" aria-label="PragmaOS inicio">
              <div class="w-9 h-9 rounded-xl bg-[#05111e] flex items-center justify-center shrink-0">
                <i class="ph-bold ph-scales text-white text-lg" aria-hidden="true" />
              </div>
              <span class="text-lg font-extrabold tracking-tight text-[#05111e]">PragmaOS</span>
            </a>

            <nav class="hidden md:flex items-center gap-7">
              {NAV.map((n) => (
                <a href={n.href} class={`text-sm font-semibold transition-colors ${active === n.label ? "text-[#05111e] border-b-2 border-[#05111e] pb-1" : "text-[#44474c] hover:text-[#05111e]"}`}>{n.label}</a>
              ))}
            </nav>

            <div class="hidden md:flex items-center gap-3">
              <a href="/login" class="text-sm font-semibold text-[#05111e] hover:text-[#1a2634] transition-colors px-4 py-2 border border-[#c4c6cc] rounded-lg hover:bg-[#f1f4f6]">Entrar</a>
              <a href="/signup" class="text-sm font-semibold bg-[#05111e] text-white px-4 py-2 rounded-lg hover:bg-[#1a2634] transition-colors">Teste grátis</a>
            </div>

            {/* Mobile */}
            <button class="md:hidden p-2 rounded-lg hover:bg-[#f1f4f6]" {...{ "@click": "open = !open" }} aria-label="Menu">
              <i class="ph ph-list text-xl text-[#05111e]" aria-hidden="true" />
            </button>
          </div>
          <div {...{ "x-show": "open" }} x-cloak class="md:hidden border-t border-[#c4c6cc] px-4 py-3 flex flex-col gap-3 bg-white">
            {NAV.map((n) => <a href={n.href} class="text-sm font-medium text-[#44474c] hover:text-[#05111e]">{n.label}</a>)}
            <div class="flex gap-3 pt-2 border-t border-[#c4c6cc]">
              <a href="/login" class="flex-1 text-center text-sm font-semibold text-[#05111e] py-2 rounded-lg border border-[#c4c6cc]">Entrar</a>
              <a href="/signup" class="flex-1 text-center text-sm font-semibold bg-[#05111e] text-white py-2 rounded-lg">Teste grátis</a>
            </div>
          </div>
        </header>

        <main class="flex-1">{children}</main>

        {/* Footer — dark navy, cinematic */}
        <footer class="bg-[#05111e] text-[#bbc7da] mt-auto">
          <div class="max-w-[1200px] mx-auto px-4 sm:px-6 py-12">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div class="col-span-2 md:col-span-1">
                <div class="flex items-center gap-2.5 mb-3">
                  <div class="w-8 h-8 rounded-lg bg-[#1a2634] flex items-center justify-center">
                    <i class="ph-bold ph-scales text-white text-sm" aria-hidden="true" />
                  </div>
                  <span class="text-base font-bold text-white">PragmaOS</span>
                </div>
                <p class="text-sm text-[#818d9f] max-w-xs">A plataforma all-in-one de gestão jurídica para escritórios que querem crescer com dados, não com planilhas.</p>
              </div>

              <div>
                <h4 class="text-sm font-semibold text-white mb-3">Produto</h4>
                <ul class="space-y-2 text-sm">
                  <li><a href="/#recursos" class="hover:text-white transition-colors">Recursos</a></li>
                  <li><a href="/#planos" class="hover:text-white transition-colors">Planos</a></li>
                  <li><a href="/#integracoes" class="hover:text-white transition-colors">Integrações</a></li>
                  <li><a href="/#seguranca" class="hover:text-white transition-colors">Segurança</a></li>
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
                  <li class="flex items-center gap-2"><i class="ph ph-envelope text-[#818d9f]" aria-hidden="true" /><a href="mailto:comercial@pragmaos.com.br" class="hover:text-white">comercial@pragmaos.com.br</a></li>
                  <li class="flex items-center gap-2"><i class="ph ph-whatsapp-logo text-[#818d9f]" aria-hidden="true" /><a href="https://wa.me/5535984641515" class="hover:text-white">WhatsApp comercial</a></li>
                </ul>
              </div>
            </div>

            <div class="border-t border-[#1a2634] mt-10 pt-6 flex flex-col md:flex-row justify-between gap-4 text-xs text-[#818d9f]">
              <p>&copy; {new Date().getFullYear()} PragmaOS. Todos os direitos reservados.</p>
              <p>Feito no Brasil para advogados brasileiros.</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
};
