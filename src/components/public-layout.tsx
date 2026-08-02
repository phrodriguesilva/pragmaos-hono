// Public site layout — header + footer with tenant branding.
// This is used for all public-facing pages (home, areas, articles, contact).

import type { FC, PropsWithChildren } from "hono/jsx";
import type { ResolvedTenant } from "../lib/tenant-resolver";

export const PublicLayout: FC<PropsWithChildren<{ tenant: ResolvedTenant; active?: string }>> = ({
  tenant,
  active,
  children,
}) => {
  const primary = tenant.primary_color || "#c8553d";
  const secondary = tenant.secondary_color || "#2b2925";

  return (
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{tenant.name} — {tenant.tagline ?? "Advocacia"}</title>
        <meta name="description" content={tenant.description ?? `${tenant.name} — escritorio de advocacia`} />
        <link rel="icon" href={tenant.logo_url ?? "/static/img/icon.svg"} type="image/svg+xml" />
        <link rel="stylesheet" href="/static/css/tailwind.css" />
        <link rel="stylesheet" href="/static/css/phosphor-regular.css" />
        <link rel="stylesheet" href="/static/css/phosphor-bold.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet" />
        <style>{`
          :root {
            --color-primary: ${primary};
            --color-secondary: ${secondary};
          }
          body { font-family: 'Inter', sans-serif; }
          .font-serif { font-family: 'Source Serif 4', serif; }
          .bg-primary { background-color: ${primary}; }
          .text-primary { color: ${primary}; }
          .border-primary { border-color: ${primary}; }
          .bg-secondary { background-color: ${secondary}; }
          .text-secondary { color: ${secondary}; }
          .hover\\:text-primary:hover { color: ${primary}; }
          .hover\\:bg-primary:hover { background-color: ${primary}; }
          .hover\\:border-primary:hover { border-color: ${primary}; }
        `}</style>
      </head>
      <body class="bg-white text-gray-900 min-h-screen flex flex-col">
        {/* Header */}
        <header class="bg-white border-b border-gray-100 sticky top-0 z-30">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            {/* Logo */}
            <a href="/" class="flex items-center gap-2.5">
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
              <a href="/" class={`text-sm font-medium ${active === "home" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>Inicio</a>
              <a href="/areas" class={`text-sm font-medium ${active === "areas" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>Areas de Atuacao</a>
              <a href="/artigos" class={`text-sm font-medium ${active === "artigos" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>Artigos</a>
              <a href="/sobre" class={`text-sm font-medium ${active === "sobre" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>Sobre</a>
              <a href="/contato" class="btn btn-primary text-sm">Contato</a>
            </nav>

            {/* Mobile menu button */}
            <button class="md:hidden p-2 rounded-lg hover:bg-gray-50" {...{ "x-data": "{ open: false }", "@click": "open = !open" }} aria-label="Menu">
              <i class="ph ph-list text-xl text-gray-600" aria-hidden="true" />
            </button>
          </div>

          {/* Mobile nav */}
          <div {...{ "x-show": "open", "x-transition": "" }} x-cloak class="md:hidden border-t border-gray-100 px-4 py-3 flex flex-col gap-3">
            <a href="/" class="text-sm font-medium text-gray-600 hover:text-primary">Inicio</a>
            <a href="/areas" class="text-sm font-medium text-gray-600 hover:text-primary">Areas de Atuacao</a>
            <a href="/artigos" class="text-sm font-medium text-gray-600 hover:text-primary">Artigos</a>
            <a href="/sobre" class="text-sm font-medium text-gray-600 hover:text-primary">Sobre</a>
            <a href="/contato" class="btn btn-primary text-sm text-center">Contato</a>
          </div>
        </header>

        {/* Main content */}
        <main class="flex-1">{children}</main>

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
                {tenant.tagline && <p class="text-sm text-gray-400">{tenant.tagline}</p>}
                {tenant.oab_number && <p class="text-xs text-gray-500 mt-2">OAB: {tenant.oab_number}</p>}
              </div>

              {/* Contact */}
              <div>
                <h4 class="text-sm font-semibold text-white mb-3">Contato</h4>
                <ul class="space-y-2 text-sm">
                  {tenant.email_public && (
                    <li class="flex items-center gap-2">
                      <i class="ph ph-envelope text-gray-500" aria-hidden="true" />
                      <a href={`mailto:${tenant.email_public}`} class="hover:text-white">{tenant.email_public}</a>
                    </li>
                  )}
                  {tenant.phone && (
                    <li class="flex items-center gap-2">
                      <i class="ph ph-phone text-gray-500" aria-hidden="true" />
                      <a href={`tel:${tenant.phone}`} class="hover:text-white">{tenant.phone}</a>
                    </li>
                  )}
                  {tenant.address && (
                    <li class="flex items-start gap-2">
                      <i class="ph ph-map-pin text-gray-500 mt-0.5" aria-hidden="true" />
                      <span>{tenant.address}</span>
                    </li>
                  )}
                </ul>
              </div>

              {/* Social + Links */}
              <div>
                <h4 class="text-sm font-semibold text-white mb-3">Navegacao</h4>
                <ul class="space-y-2 text-sm">
                  <li><a href="/" class="hover:text-white">Inicio</a></li>
                  <li><a href="/areas" class="hover:text-white">Areas de Atuacao</a></li>
                  <li><a href="/artigos" class="hover:text-white">Artigos</a></li>
                  <li><a href="/sobre" class="hover:text-white">Sobre</a></li>
                  <li><a href="/contato" class="hover:text-white">Contato</a></li>
                </ul>
                {(tenant.social_facebook || tenant.social_instagram || tenant.social_linkedin) && (
                  <div class="flex gap-3 mt-4">
                    {tenant.social_facebook && <a href={tenant.social_facebook} class="text-gray-400 hover:text-white" aria-label="Facebook"><i class="ph ph-facebook-logo text-lg" aria-hidden="true" /></a>}
                    {tenant.social_instagram && <a href={tenant.social_instagram} class="text-gray-400 hover:text-white" aria-label="Instagram"><i class="ph ph-instagram-logo text-lg" aria-hidden="true" /></a>}
                    {tenant.social_linkedin && <a href={tenant.social_linkedin} class="text-gray-400 hover:text-white" aria-label="LinkedIn"><i class="ph ph-linkedin-logo text-lg" aria-hidden="true" /></a>}
                  </div>
                )}
              </div>
            </div>

            <div class="border-t border-white/10 mt-8 pt-6 flex items-center justify-between text-xs text-gray-500">
              <span>&copy; {new Date().getFullYear()} {tenant.name}. Todos os direitos reservados.</span>
              <span>Powered by PragmaOS</span>
            </div>
          </div>
        </footer>

        <script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer />
      </body>
    </html>
  );
};
