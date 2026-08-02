// Public site layout — header + footer with tenant branding.
// This is used for all public-facing pages (home, areas, articles, contact).

import type { FC, PropsWithChildren } from "hono/jsx";
import type { ResolvedTenant } from "../lib/tenant-resolver";
import { appCss } from "../generated/css";

export const PublicLayout: FC<PropsWithChildren<{ tenant: ResolvedTenant; active?: string; basePath?: string; pageTitle?: string; pageDescription?: string; canonical?: string; ogType?: string; jsonLd?: object }>> = ({
  tenant,
  active,
  basePath = "",
  pageTitle,
  pageDescription,
  canonical,
  ogType = "website",
  jsonLd,
  children,
}) => {
  const primary = tenant.primary_color || "#05111e";
  const secondary = tenant.secondary_color || "#1a2634";
  const b = basePath;
  const title = pageTitle ?? `${tenant.name} — ${tenant.tagline ?? "Advocacia"}`;
  const description = pageDescription ?? (tenant.description ?? `${tenant.name} — escritório de advocacia`);
  const favicon = tenant.logo_url ?? "/static/img/icon.svg";
  const canonicalUrl = canonical ?? undefined;

  return (
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="icon" href={favicon} type="image/svg+xml" />
        {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

        {/* Open Graph */}
        <meta property="og:type" content={ogType} />
        <meta property="og:site_name" content={tenant.name} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        {tenant.logo_url && <meta property="og:image" content={tenant.logo_url} />}
        <meta property="og:locale" content="pt_BR" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        {tenant.logo_url && <meta name="twitter:image" content={tenant.logo_url} />}

        {/* Structured data — LegalService */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "LegalService",
          name: tenant.name,
          description: description,
          url: canonicalUrl,
          ...(tenant.email_public ? { email: tenant.email_public } : {}),
          ...(tenant.phone ? { telephone: tenant.phone } : {}),
          ...(tenant.address ? { address: { "@type": "PostalAddress", streetAddress: tenant.address } } : {}),
          ...(tenant.logo_url ? { logo: tenant.logo_url } : {}),
        }) }} />

        {/* Additional page-specific JSON-LD (Article, Attorney, etc.) */}
        {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}

        <link rel="preload" href="/static/fonts/Phosphor.woff2" as="font" type="font/woff2" crossorigin="" />
        <link rel="preload" href="/static/fonts/Phosphor-Bold.woff2" as="font" type="font/woff2" crossorigin="" />
        <style dangerouslySetInnerHTML={{ __html: appCss }} />
        <link rel="stylesheet" href="/static/css/phosphor-regular.css" />
        <link rel="stylesheet" href="/static/css/phosphor-bold.css" />
        <script src="/static/js/alpine.min.js" defer />
        <style>{`
          :root {
            --color-primary: ${primary};
            --color-secondary: ${secondary};
          }
          html { scroll-behavior: smooth; }
          body { font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; }
          .font-serif { font-family: 'Source Serif 4', serif; }
          .bg-primary { background-color: ${primary}; }
          .text-primary { color: ${primary}; }
          .border-primary { border-color: ${primary}; }
          .bg-secondary { background-color: ${secondary}; }
          .text-secondary { color: ${secondary}; }
          .hover\\:text-primary:hover { color: ${primary}; }
          .hover\\:bg-primary:hover { background-color: ${primary}; }
          .hover\\:border-primary:hover { border-color: ${primary}; }
          .btn:focus-visible, a:focus-visible { outline: 2px solid ${primary}; outline-offset: 2px; }

          /* Scroll reveal animation */
          .reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.6s ease, transform 0.6s ease; }
          .reveal.revealed { opacity: 1; transform: translateY(0); }
          @media (prefers-reduced-motion: reduce) {
            .reveal { opacity: 1; transform: none; transition: none; }
            html { scroll-behavior: auto; }
          }
        `}</style>
        {/* Scroll reveal + back-to-top + stat counter script */}
        <script>{`
          (function() {
            // Scroll reveal with IntersectionObserver
            const obs = new IntersectionObserver((entries) => {
              entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('revealed'); obs.unobserve(e.target); } });
            }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
            document.addEventListener('DOMContentLoaded', () => {
              document.querySelectorAll('section').forEach(s => { s.classList.add('reveal'); obs.observe(s); });
              // Animated stat counters
              const statObs = new IntersectionObserver((entries) => {
                entries.forEach(e => {
                  if (!e.isIntersecting) return;
                  const el = e.target;
                  const raw = el.dataset.value || "";
                  const prefix = el.dataset.prefix || "";
                  const suffix = el.dataset.suffix || "";
                  statObs.unobserve(el);
                  const m = raw.match(/(\\d+[\\.,]?\\d*)/);
                  if (!m) return;
                  const numStr = m[1];
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
                    else el.textContent = prefix + raw + suffix;
                  };
                  requestAnimationFrame(step);
                });
              }, { threshold: 0.5 });
              document.querySelectorAll('.stat-counter').forEach(el => statObs.observe(el));
            });
            // Back to top
            window.addEventListener('scroll', () => {
              const btn = document.getElementById('back-to-top');
              if (btn) btn.style.opacity = window.scrollY > 400 ? '1' : '0';
            });
          })();
        `}</script>
      </head>
      <body class="bg-white text-gray-900 min-h-screen flex flex-col">
        {/* Header */}
        <header {...{ "x-data": "{ open: false, scrolled: false }", "@scroll.window": "scrolled = window.scrollY > 20", ":class": "scrolled ? 'border-gray-200 shadow-sm' : 'border-gray-100'" }} class="bg-white/95 backdrop-blur-sm border-b sticky top-0 z-30 transition-all duration-200">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            {/* Logo */}
            <a href={`${b}/`} class="flex items-center gap-2.5">
              {tenant.logo_url ? (
                <img src={tenant.logo_url} alt={tenant.name} class="h-9 w-auto" />
              ) : (
                <div class="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
                  <i class="ph-bold ph-scales text-white text-lg" aria-hidden="true" />
                </div>
              )}
              <span class="text-lg font-semibold text-secondary tracking-tight">{tenant.name}</span>
            </a>

            {/* Nav */}
            <nav class="hidden md:flex items-center gap-6">
              <a href={`${b}/`} class={`text-sm font-medium ${active === "home" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>Início</a>
              <a href={`${b}/areas`} class={`text-sm font-medium ${active === "areas" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>Áreas de Atuação</a>
              <a href={`${b}/equipe`} class={`text-sm font-medium ${active === "equipe" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>Equipe</a>
              <a href={`${b}/artigos`} class={`text-sm font-medium ${active === "artigos" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>Artigos</a>
              <a href={`${b}/reconhecimentos`} class={`text-sm font-medium ${active === "reconhecimentos" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>Reconhecimentos</a>
              <a href={`${b}/sobre`} class={`text-sm font-medium ${active === "sobre" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>Sobre</a>
              <a href={`${b}/contato`} class="btn btn-primary text-sm">Contato</a>
            </nav>

            {/* Mobile menu button */}
            <button class="md:hidden p-2 rounded-lg hover:bg-gray-50" {...{ "@click": "open = !open" }} aria-label="Menu">
              <i class="ph ph-list text-xl text-gray-600" aria-hidden="true" />
            </button>
          </div>

          {/* Mobile nav */}
          <div {...{ "x-show": "open", "x-transition": "" }} x-cloak class="md:hidden border-t border-gray-100 px-4 py-3 flex flex-col gap-3">
            <a href={`${b}/`} class="text-sm font-medium text-gray-600 hover:text-primary">Início</a>
            <a href={`${b}/areas`} class="text-sm font-medium text-gray-600 hover:text-primary">Áreas de Atuação</a>
            <a href={`${b}/equipe`} class="text-sm font-medium text-gray-600 hover:text-primary">Equipe</a>
            <a href={`${b}/artigos`} class="text-sm font-medium text-gray-600 hover:text-primary">Artigos</a>
            <a href={`${b}/reconhecimentos`} class="text-sm font-medium text-gray-600 hover:text-primary">Reconhecimentos</a>
            <a href={`${b}/sobre`} class="text-sm font-medium text-gray-600 hover:text-primary">Sobre</a>
            <a href={`${b}/contato`} class="btn btn-primary text-sm text-center">Contato</a>
          </div>
        </header>

        {/* Main content */}
        <main class="flex-1 pb-16 md:pb-0">{children}</main>

        {/* Sticky mobile action bar */}
        {(tenant.phone || tenant.whatsapp) && (
          <div class="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-20 flex">
            {tenant.phone && (
              <a href={`tel:${tenant.phone}`} class="flex-1 flex flex-col items-center gap-0.5 py-2 text-gray-600 hover:text-primary" aria-label="Ligar">
                <i class="ph-bold ph-phone text-xl" aria-hidden="true" />
                <span class="text-xs">Ligar</span>
              </a>
            )}
            {tenant.whatsapp && (
              <a href={`https://wa.me/${tenant.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener" class="flex-1 flex flex-col items-center gap-0.5 py-2 text-green-600" aria-label="WhatsApp">
                <i class="ph-bold ph-whatsapp-logo text-xl" aria-hidden="true" />
                <span class="text-xs">WhatsApp</span>
              </a>
            )}
            <a href={`${b}/contato`} class="flex-1 flex flex-col items-center gap-0.5 py-2 text-primary" aria-label="Contato">
              <i class="ph-bold ph-envelope text-xl" aria-hidden="true" />
              <span class="text-xs">Contato</span>
            </a>
          </div>
        )}

        {/* Footer */}
        <footer class="bg-secondary text-gray-300 mt-auto">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 py-10">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Brand */}
              <div>
                <div class="flex items-center gap-2.5 mb-3">
                  <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                    <i class="ph-bold ph-scales text-white text-sm" aria-hidden="true" />
                  </div>
                  <span class="text-base font-semibold text-white">{tenant.name}</span>
                </div>
                {tenant.tagline && <p class="text-sm text-gray-300">{tenant.tagline}</p>}
                {tenant.oab_number && <p class="text-xs text-gray-400 mt-2">OAB: {tenant.oab_number}</p>}
              </div>

              {/* Contact */}
              <div>
                <h4 class="text-sm font-semibold text-white mb-3">Contato</h4>
                <ul class="space-y-2 text-sm">
                  {tenant.email_public && (
                    <li class="flex items-center gap-2">
                      <i class="ph ph-envelope text-gray-400" aria-hidden="true" />
                      <a href={`mailto:${tenant.email_public}`} class="hover:text-white">{tenant.email_public}</a>
                    </li>
                  )}
                  {tenant.phone && (
                    <li class="flex items-center gap-2">
                      <i class="ph ph-phone text-gray-400" aria-hidden="true" />
                      <a href={`tel:${tenant.phone}`} class="hover:text-white">{tenant.phone}</a>
                    </li>
                  )}
                  {tenant.address && (
                    <li class="flex items-start gap-2">
                      <i class="ph ph-map-pin text-gray-400 mt-0.5" aria-hidden="true" />
                      <span>{tenant.address}</span>
                    </li>
                  )}
                </ul>
              </div>

              {/* Social + Links */}
              <div>
                <h4 class="text-sm font-semibold text-white mb-3">Navegação</h4>
                <ul class="space-y-2 text-sm">
                  <li><a href={`${b}/`} class="hover:text-white">Início</a></li>
                  <li><a href={`${b}/areas`} class="hover:text-white">Áreas de Atuação</a></li>
                  <li><a href={`${b}/equipe`} class="hover:text-white">Equipe</a></li>
                  <li><a href={`${b}/artigos`} class="hover:text-white">Artigos</a></li>
                  <li><a href={`${b}/reconhecimentos`} class="hover:text-white">Reconhecimentos</a></li>
                  <li><a href={`${b}/sobre`} class="hover:text-white">Sobre</a></li>
                  <li><a href={`${b}/contato`} class="hover:text-white">Contato</a></li>
                </ul>
                {(tenant.social_facebook || tenant.social_instagram || tenant.social_linkedin) && (
                  <div class="flex gap-3 mt-4">
                    {tenant.social_facebook && <a href={tenant.social_facebook} class="text-gray-300 hover:text-white" aria-label="Facebook"><i class="ph ph-facebook-logo text-lg" aria-hidden="true" /></a>}
                    {tenant.social_instagram && <a href={tenant.social_instagram} class="text-gray-300 hover:text-white" aria-label="Instagram"><i class="ph ph-instagram-logo text-lg" aria-hidden="true" /></a>}
                    {tenant.social_linkedin && <a href={tenant.social_linkedin} class="text-gray-300 hover:text-white" aria-label="LinkedIn"><i class="ph ph-linkedin-logo text-lg" aria-hidden="true" /></a>}
                  </div>
                )}
              </div>
            </div>

            <div class="border-t border-white/10 mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
              <span>&copy; {new Date().getFullYear()} {tenant.name}. Todos os direitos reservados.</span>
              <div class="flex gap-4">
                <a href={`${b}/lgpd`} class="hover:text-white transition">Política de Privacidade</a>
                <a href={`${b}/lgpd/termos`} class="hover:text-white transition">Termos de Uso</a>
              </div>
              <span>Powered by PragmaOS</span>
            </div>
          </div>
        </footer>

        {/* WhatsApp floating button with pre-filled message */}
        {tenant.whatsapp && (
          <a
            href={`https://wa.me/${tenant.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá, gostaria de falar com ${tenant.name}.`)}`}
            target="_blank"
            rel="noopener"
            class="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#25D366] shadow-lg hover:scale-110 transition flex items-center justify-center"
            aria-label="Falar no WhatsApp"
          >
            <i class="ph-bold ph-whatsapp-logo text-white text-2xl" aria-hidden="true" />
          </a>
        )}

        {/* Back to top button */}
        <button
          id="back-to-top"
          onclick="window.scrollTo({ top: 0, behavior: 'smooth' })"
          class="fixed bottom-6 left-6 z-40 w-11 h-11 rounded-full bg-secondary text-white shadow-lg hover:scale-110 transition flex items-center justify-center"
          style="opacity: 0; transition: opacity 0.3s;"
          aria-label="Voltar ao topo"
        >
          <i class="ph-bold ph-arrow-up text-lg" aria-hidden="true" />
        </button>

        {/* Cookie consent banner (LGPD) */}
        <div
          {...{ "x-data": "{ shown: !localStorage.getItem('cookie-consent') }", "x-show": "shown", "x-transition": "", "x-cloak": "" }}
          class="fixed bottom-0 left-0 right-0 z-50 bg-secondary text-white px-4 py-4 shadow-lg"
          role="dialog"
          aria-label="Consentimento de cookies"
        >
          <div class="max-w-5xl mx-auto flex flex-col sm:flex-row items-center gap-4">
            <p class="text-sm text-gray-300 flex-1">
              Usamos cookies essenciais para o funcionamento do site. Ao continuar navegando, você concorda com nossa{" "}
              <a href={`${b}/lgpd`} class="underline hover:text-white">Política de Privacidade</a>.
            </p>
            <button
              {...{ "@click": "localStorage.setItem('cookie-consent', '1'); shown = false" }}
              class="bg-primary text-white px-5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap hover:opacity-90 transition"
            >
              Entendi
            </button>
          </div>
        </div>
      </body>
    </html>
  );
};
