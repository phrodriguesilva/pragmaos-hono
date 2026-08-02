import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import {
  helpCategories,
  helpArticles,
  getArticlesByCategory,
  searchArticles,
  type HelpCategory,
  type HelpArticle,
} from "../lib/help-content";
import { PageHeader, Panel, Badge } from "../components/ui";

export const helpRoutes = new Hono<AppEnv>();

helpRoutes.use("*", requireAuth);

// GET /help — help home with categories.
helpRoutes.get("/", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";

  if (q) {
    // Search mode.
    const results = searchArticles(q);
    return renderPage(
      c,
      { title: "Ajuda", active: "help" },
      <>
        <PageHeader title="Ajuda" icon="ph-lifebuoy" />

        <form method="get" action="/help" class="mb-6">
          <div class="relative max-w-xl">
            <i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true"></i>
            <input
              type="text"
              name="q"
              value={q}
              placeholder="Buscar na ajuda..."
              class="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-terracota-500"
              autofocus
            />
          </div>
        </form>

        <div class="text-sm text-gray-500 mb-4">
          {results.length} resultado{results.length !== 1 ? "s" : ""} para "{q}"
        </div>

        <div class="space-y-3">
          {results.map((article) => (
            <a href={`/help/${article.slug}`} class="block p-4 bg-white rounded-lg border border-gray-100 hover:border-terracota-300 hover:shadow-sm transition">
              <div class="font-medium text-carvao-800">{article.title}</div>
              <div class="text-sm text-gray-600 mt-1">{article.excerpt}</div>
            </a>
          ))}

          {results.length === 0 && (
            <div class="text-center py-12 text-gray-400">
              <i class="ph ph-magnifying-glass-minus text-h1 block mb-2" aria-hidden="true"></i>
              Nenhum resultado para "{q}"
            </div>
          )}
        </div>
      </>,
    );
  }

  // Home: show categories.
  return renderPage(
    c,
    { title: "Ajuda", active: "help" },
    <>
      <PageHeader title="Central de Ajuda" icon="ph-lifebuoy" />

      <form method="get" action="/help" class="mb-8">
        <div class="relative max-w-xl">
          <i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true"></i>
          <input
            type="text"
            name="q"
            placeholder="Buscar na ajuda..."
            class="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-terracota-500"
          />
        </div>
      </form>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {helpCategories.map((cat: HelpCategory) => {
          const articles = getArticlesByCategory(cat.slug);
          return (
            <a href={`/help/c/${cat.slug}`} class="block p-5 bg-white rounded-lg border border-gray-100 hover:border-terracota-300 hover:shadow-sm transition">
              <div class="flex items-start gap-3">
                <i class={`ph ${cat.icon} text-h3 text-terracota-600`} aria-hidden="true"></i>
                <div class="flex-1">
                  <div class="font-medium text-carvao-800">{cat.name}</div>
                  <div class="text-sm text-gray-500 mt-1">{cat.description}</div>
                  <div class="text-xs text-gray-400 mt-2">{articles.length} artigo{articles.length !== 1 ? "s" : ""}</div>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </>,
  );
});

// GET /help/c/:category — list articles in a category.
helpRoutes.get("/c/:category", async (c) => {
  const catSlug = c.req.param("category");
  const category = helpCategories.find((c) => c.slug === catSlug);

  if (!category) {
    return c.redirect("/help");
  }

  const articles = getArticlesByCategory(catSlug);

  return renderPage(
    c,
    { title: category.name, active: "help" },
    <>
      <PageHeader title={category.name} icon={category.icon} />

      <div class="max-w-3xl space-y-3">
        {articles.map((article: HelpArticle) => (
          <a href={`/help/${article.slug}`} class="block p-4 bg-white rounded-lg border border-gray-100 hover:border-terracota-300 hover:shadow-sm transition">
            <div class="font-medium text-carvao-800">{article.title}</div>
            <div class="text-sm text-gray-600 mt-1">{article.excerpt}</div>
          </a>
        ))}

        {articles.length === 0 && (
          <div class="text-center py-12 text-gray-400">
            Nenhum artigo nesta categoria ainda.
          </div>
        )}
      </div>
    </>,
  );
});

// GET /help/:slug — view a specific article.
helpRoutes.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const article = helpArticles.find((a) => a.slug === slug);

  if (!article) {
    return c.redirect("/help");
  }

  const category = helpCategories.find((c) => c.slug === article.category);
  const related = helpArticles
    .filter((a) => a.category === article.category && a.slug !== article.slug)
    .slice(0, 5);

  return renderPage(
    c,
    { title: article.title, active: "help" },
    <>
      <div class="max-w-3xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div class="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <a href="/help" class="hover:text-terracota-600">Ajuda</a>
          <i class="ph ph-caret-right text-xs" aria-hidden="true"></i>
          {category && (
            <>
              <a href={`/help/c/${category.slug}`} class="hover:text-terracota-600">{category.name}</a>
              <i class="ph ph-caret-right text-xs" aria-hidden="true"></i>
            </>
          )}
          <span class="text-carvao-800">{article.title}</span>
        </div>

        <h1 class="text-h1 font-bold text-carvao-800 mb-4">{article.title}</h1>
        <p class="text-gray-600 mb-8">{article.excerpt}</p>

        <div class="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: article.body }} />

        {/* Related articles */}
        {related.length > 0 && (
          <div class="mt-12 pt-8 border-t border-gray-100">
            <h2 class="text-lg font-semibold mb-4">Artigos relacionados</h2>
            <div class="space-y-2">
              {related.map((r) => (
                <a href={`/help/${r.slug}`} class="block text-sm text-terracota-600 hover:underline">
                  {r.title}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </>,
  );
});
