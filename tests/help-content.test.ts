import { describe, it, expect } from "bun:test";
import {
  helpCategories,
  helpArticles,
  getArticlesByCategory,
  searchArticles,
} from "../src/lib/help-content";

describe("help-content.ts", () => {
  describe("helpCategories", () => {
    it("should have at least 8 categories", () => {
      expect(helpCategories.length).toBeGreaterThanOrEqual(8);
    });

    it("should have slug, name, icon, and description for each category", () => {
      for (const cat of helpCategories) {
        expect(cat.slug).toBeTruthy();
        expect(cat.name).toBeTruthy();
        expect(cat.icon).toBeTruthy();
        expect(cat.description).toBeTruthy();
      }
    });

    it("should have unique slugs", () => {
      const slugs = helpCategories.map((c) => c.slug);
      const unique = new Set(slugs);
      expect(unique.size).toBe(slugs.length);
    });
  });

  describe("helpArticles", () => {
    it("should have at least 20 articles", () => {
      expect(helpArticles.length).toBeGreaterThanOrEqual(20);
    });

    it("should have slug, title, category, excerpt, and body for each article", () => {
      for (const article of helpArticles) {
        expect(article.slug).toBeTruthy();
        expect(article.title).toBeTruthy();
        expect(article.category).toBeTruthy();
        expect(article.excerpt).toBeTruthy();
        expect(article.body).toBeTruthy();
      }
    });

    it("should have unique slugs", () => {
      const slugs = helpArticles.map((a) => a.slug);
      const unique = new Set(slugs);
      expect(unique.size).toBe(slugs.length);
    });

    it("should reference valid categories", () => {
      const validSlugs = new Set(helpCategories.map((c) => c.slug));
      for (const article of helpArticles) {
        expect(validSlugs.has(article.category)).toBe(true);
      }
    });
  });

  describe("getArticlesByCategory", () => {
    it("should return articles for a valid category", () => {
      const articles = getArticlesByCategory("primeiros-passos");
      expect(articles.length).toBeGreaterThan(0);
      for (const a of articles) {
        expect(a.category).toBe("primeiros-passos");
      }
    });

    it("should return empty array for invalid category", () => {
      const articles = getArticlesByCategory("invalid-category");
      expect(articles).toEqual([]);
    });
  });

  describe("searchArticles", () => {
    it("should find articles by title", () => {
      const results = searchArticles("whatsapp");
      expect(results.length).toBeGreaterThan(0);
    });

    it("should find articles by body content", () => {
      const results = searchArticles("cliente");
      expect(results.length).toBeGreaterThan(0);
    });

    it("should be case-insensitive", () => {
      const lower = searchArticles("whatsapp");
      const upper = searchArticles("WHATSAPP");
      expect(lower.length).toBe(upper.length);
    });

    it("should return empty for no matches", () => {
      const results = searchArticles("xyzqwertynonexistent");
      expect(results).toEqual([]);
    });
  });
});
