// Help center — in-app documentation for users.
// Renders a knowledge base with categories, articles, and search.
// PragmaOS.

import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { requireAuth } from "../lib/session";
import { supabase } from "../lib/supabase";
import { appCss } from "../generated/css";
import { helpCategories, type HelpCategory, type HelpArticle } from "../lib/help-content";

export const helpRoutes = new Hono<AppEnv>();

helpRoutes.use("*", requireAuth);

// ============================================================
// Layout — help center has its own layout (sidebar + content)
// ============================================================

function HelpLayout({
  title,
  userName,
  userRole,
  activeCategory,
  activeArticle,
  children,
}: {
  title: string;
  userName: string;
  userRole?: string;
  activeCategory?: string;
  activeArticle?: string;
  children: any;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} - Central de Ajuda - PragmaOS</title>
        <style dangerouslySetInnerHTML={{ __html: appCss }} />
        <link rel="stylesheet" href="/static/css/phosphor-regular.css" />
        <link rel="stylesheet" href="/static/css/phosphor-bold.css" />
        <script src="/static/js/alpine.min.js" defer />
      </head>
      <body class="bg-gray-50 text-body font-sans antialiased">
        {/* Top bar */}
        <header class="bg-white border-b border-gray-100 sticky top-0 z-30">
          <div class="flex items-center justify-between px-6 py-3.5">
            <div class="flex items-center gap-3">
              <a href="/" class="flex items-center gap-2 text-gray-600 hover:text-gray-800 text-body-sm">
                <i class="ph ph-arrow-left" aria-hidden="true" />
                Voltar ao sistema
              </a>
              <span class="text-gray-200">|</span>
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded-lg bg-terracota-500 flex items-center justify-center">
                  <i class="ph-bold ph-scales text-white text-body" aria-hidden="true" />
                </div>
                <span class="text-h4 font-semibold text-carvao-800">Central de Ajuda</span>
              </div>
            </div>
            <div class="flex items-center gap-3 text-body-sm text-gray-500">
              <span class="hidden sm:inline">{userName}</span>
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-terracota-400 to-terracota-600 flex items-center justify-center text-white text-body-xs font-bold">
                {userName.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <div class="flex max-w-7xl mx-auto">
          {/* Help sidebar */}
          <aside class="w-64 shrink-0 border-r border-gray-100 h-[calc(100vh-57px)] sticky top-[57px] overflow-y-auto hidden lg:block">
            <nav class="p-4 flex flex-col gap-1">
              <a
                href="/help"
                class={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-body-sm ${!activeCategory ? "bg-terracota-500/10 text-terracota-700 font-semibold" : "text-gray-600 hover:bg-gray-50"}`}
              >
                <i class="ph ph-house" aria-hidden="true" />
                Inicio
              </a>
              {helpCategories.map((cat) => (
                <div key={cat.slug} class="flex flex-col">
                  <a
                    href={`/help/${cat.slug}`}
                    class={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-body-sm ${activeCategory === cat.slug && !activeArticle ? "bg-terracota-500/10 text-terracota-700 font-semibold" : "text-gray-600 hover:bg-gray-50"}`}
                  >
                    <i class={`ph ${cat.icon}`} aria-hidden="true" />
                    {cat.title}
                  </a>
                  {activeCategory === cat.slug ? (
                    <div class="flex flex-col pl-4 mt-0.5 gap-0.5">
                      {cat.articles.map((art) => (
                        <a
                          key={art.slug}
                          href={`/help/${cat.slug}/${art.slug}`}
                          class={`px-3 py-1.5 rounded-lg text-body-xs ${activeArticle === art.slug ? "text-terracota-700 font-medium" : "text-gray-500 hover:text-gray-700"}`}
                        >
                          {art.title}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </nav>
          </aside>

          {/* Mobile category selector */}
          <div class="lg:hidden w-full p-4">
            <select
              class="w-full border border-gray-200 rounded-lg px-3 py-2 text-body-sm"
              onchange="window.location = this.value"
            >
              <option value="/help">Inicio</option>
              {helpCategories.map((cat) => (
                <optgroup key={cat.slug} label={cat.title}>
                  {cat.articles.map((art) => (
                    <option value={`/help/${cat.slug}/${art.slug}`}>{art.title}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Main content */}
          <main class="flex-1 min-w-0 p-6 lg:p-10 max-w-4xl">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

// ============================================================
// Routes
// ============================================================

// GET /help — home page with category cards
helpRoutes.get("/", async (c) => {
  const user = c.get("user");

  return c.html(
    <HelpLayout title="Central de Ajuda" userName={user.fullName}>
      <div class="mb-8">
        <h1 class="text-h1 font-bold text-carvao-800 mb-2">Central de Ajuda</h1>
        <p class="text-body text-gray-600">
          Tudo o que voce precisa para dominar o PragmaOS. Guias completos, passo a passo e tutoriais para cada modulo.
        </p>
      </div>

      {/* Quick links */}
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <a href="/help/primeiros-passos/bem-vindo" class="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 hover:border-terracota-200 hover:shadow-sm transition-all">
          <div class="w-10 h-10 rounded-lg bg-terracota-500/10 flex items-center justify-center">
            <i class="ph ph-rocket text-terracota-600 text-h4" aria-hidden="true" />
          </div>
          <div>
            <div class="text-body-sm font-semibold text-gray-800">Primeiros passos</div>
            <div class="text-body-xs text-gray-500">Comece por aqui</div>
          </div>
        </a>
        <a href="/help/seguridadede/autenticacao-dois-fatores" class="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 hover:border-terracota-200 hover:shadow-sm transition-all">
          <div class="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
            <i class="ph ph-shield-check text-green-600 text-h4" aria-hidden="true" />
          </div>
          <div>
            <div class="text-body-sm font-semibold text-gray-800">Seguranca</div>
            <div class="text-body-xs text-gray-500">2FA, LGPD, senhas</div>
          </div>
        </a>
        <a href="/help/administracao/importacao-dados" class="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 hover:border-terracota-200 hover:shadow-sm transition-all">
          <div class="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <i class="ph ph-upload-simple text-blue-600 text-h4" aria-hidden="true" />
          </div>
          <div>
            <div class="text-body-sm font-semibold text-gray-800">Importar dados</div>
            <div class="text-body-xs text-gray-500">Migre de outro sistema</div>
          </div>
        </a>
      </div>

      {/* Category cards */}
      <h2 class="text-h3 font-semibold text-carvao-800 mb-4">Todos os topicos</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {helpCategories.map((cat) => (
          <a
            href={`/help/${cat.slug}`}
            class="group flex flex-col p-5 bg-white rounded-xl border border-gray-100 hover:border-terracota-200 hover:shadow-md transition-all"
          >
            <div class="flex items-center gap-3 mb-2">
              <div class="w-10 h-10 rounded-lg bg-terracota-500/10 flex items-center justify-center group-hover:bg-terracota-500/20 transition-colors">
                <i class={`ph ${cat.icon} text-terracota-600 text-h4`} aria-hidden="true" />
              </div>
              <div>
                <h3 class="text-body font-semibold text-gray-800 group-hover:text-terracota-700 transition-colors">{cat.title}</h3>
                <span class="text-body-xs text-gray-400">{cat.articles.length} {cat.articles.length === 1 ? "artigo" : "artigos"}</span>
              </div>
            </div>
            <p class="text-body-sm text-gray-500">{cat.description}</p>
          </a>
        ))}
      </div>
    </HelpLayout>,
  );
});

// GET /help/:category — list articles in a category
helpRoutes.get("/:category", async (c) => {
  const user = c.get("user");
  const catSlug = c.req.param("category");
  const category = helpCategories.find((c) => c.slug === catSlug);

  if (!category) return c.redirect("/help");

  return c.html(
    <HelpLayout title={category.title} userName={user.fullName} activeCategory={catSlug}>
      <div class="mb-6">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-12 h-12 rounded-xl bg-terracota-500/10 flex items-center justify-center">
            <i class={`ph ${category.icon} text-terracota-600 text-h3`} aria-hidden="true" />
          </div>
          <div>
            <h1 class="text-h1 font-bold text-carvao-800">{category.title}</h1>
            <p class="text-body text-gray-600">{category.description}</p>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-3">
        {category.articles.map((art, i) => (
          <a
            href={`/help/${catSlug}/${art.slug}`}
            class="group flex items-start gap-4 p-5 bg-white rounded-xl border border-gray-100 hover:border-terracota-200 hover:shadow-sm transition-all"
          >
            <div class="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 group-hover:bg-terracota-500/10 transition-colors">
              <i class={`ph ${art.icon} text-gray-500 group-hover:text-terracota-600 text-h4`} aria-hidden="true" />
            </div>
            <div class="flex-1 min-w-0">
              <h2 class="text-body font-semibold text-gray-800 group-hover:text-terracota-700 transition-colors mb-1">
                {i + 1}. {art.title}
              </h2>
              <p class="text-body-sm text-gray-500">{art.excerpt}</p>
            </div>
            <i class="ph ph-caret-right text-gray-300 group-hover:text-terracota-400 text-h4 shrink-0" aria-hidden="true" />
          </a>
        ))}
      </div>
    </HelpLayout>,
  );
});

// GET /help/:category/:article — show a single article
helpRoutes.get("/:category/:article", async (c) => {
  const user = c.get("user");
  const catSlug = c.req.param("category");
  const artSlug = c.req.param("article");
  const category = helpCategories.find((c) => c.slug === catSlug);

  if (!category) return c.redirect("/help");

  const article = category.articles.find((a) => a.slug === artSlug);
  if (!article) return c.redirect(`/help/${catSlug}`);

  // Find prev/next articles for navigation.
  const allArticles = helpCategories.flatMap((c) =>
    c.articles.map((a) => ({ ...a, catSlug: c.slug, catTitle: c.title }))
  );
  const currentIdx = allArticles.findIndex((a) => a.catSlug === catSlug && a.slug === artSlug);
  const prev = currentIdx > 0 ? allArticles[currentIdx - 1] : null;
  const next = currentIdx < allArticles.length - 1 ? allArticles[currentIdx + 1] : null;

  return c.html(
    <HelpLayout title={article.title} userName={user.fullName} activeCategory={catSlug} activeArticle={artSlug}>
      {/* Breadcrumb */}
      <nav class="flex items-center gap-2 text-body-sm text-gray-400 mb-6">
        <a href="/help" class="hover:text-gray-600">Ajuda</a>
        <i class="ph ph-caret-right text-body-xs" aria-hidden="true" />
        <a href={`/help/${catSlug}`} class="hover:text-gray-600">{category.title}</a>
        <i class="ph ph-caret-right text-body-xs" aria-hidden="true" />
        <span class="text-gray-600">{article.title}</span>
      </nav>

      {/* Article header */}
      <div class="flex items-center gap-3 mb-6">
        <div class="w-12 h-12 rounded-xl bg-terracota-500/10 flex items-center justify-center">
          <i class={`ph ${article.icon} text-terracota-600 text-h3`} aria-hidden="true" />
        </div>
        <h1 class="text-h1 font-bold text-carvao-800">{article.title}</h1>
      </div>

      {/* Article body */}
      <div
        class="prose prose-sm max-w-none text-gray-700 [&_h2]:text-h3 [&_h2]:font-semibold [&_h2]:text-carvao-800 [&_h2]:mt-6 [&_h2]:mb-3 [&_p]:mb-4 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ul]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_ol]:space-y-1.5 [&_li]:text-body [&_strong]:text-carvao-800 [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-body-sm [&_code]:text-terracota-700 [&_a]:text-terracota-600 [&_a]:underline"
        dangerouslySetInnerHTML={{ __html: article.body }}
      />

      {/* Prev/next navigation */}
      <div class="flex items-center justify-between mt-10 pt-6 border-t border-gray-100">
        {prev ? (
          <a href={`/help/${prev.catSlug}/${prev.slug}`} class="flex items-center gap-2 text-body-sm text-gray-500 hover:text-terracota-600">
            <i class="ph ph-arrow-left" aria-hidden="true" />
            <span>
              <span class="block text-body-xs text-gray-400">Anterior</span>
              {prev.title}
            </span>
          </a>
        ) : <span />}
        {next ? (
          <a href={`/help/${next.catSlug}/${next.slug}`} class="flex items-center gap-2 text-body-sm text-gray-500 hover:text-terracota-600 text-right">
            <span>
              <span class="block text-body-xs text-gray-400">Proximo</span>
              {next.title}
            </span>
            <i class="ph ph-arrow-right" aria-hidden="true" />
          </a>
        ) : <span />}
      </div>
    </HelpLayout>,
  );
});
