// Lightweight HTML sanitizer — replaces isomorphic-dompurify to avoid
// the jsdom dependency chain (jsdom reads CSS files from node_modules at
// runtime and has ESM/CJS incompatibilities that crash Vercel serverless).
// This sanitizer strips dangerous elements and attributes while preserving
// safe HTML for rendering article content.

const ALLOWED_TAGS = new Set([
  "a", "abbr", "address", "article", "aside", "b", "blockquote", "br",
  "caption", "cite", "code", "col", "colgroup", "dd", "del", "details",
  "div", "dl", "dt", "em", "figcaption", "figure", "footer", "h1", "h2",
  "h3", "h4", "h5", "h6", "header", "hr", "i", "img", "ins", "kbd",
  "li", "mark", "nav", "ol", "p", "pre", "q", "s", "samp", "section",
  "small", "span", "strong", "sub", "summary", "sup", "table", "tbody",
  "td", "tfoot", "th", "thead", "time", "tr", "u", "ul", "var", "wbr",
]);

const ALLOWED_ATTRS = new Set([
  "href", "title", "alt", "src", "width", "height", "class", "id",
  "colspan", "rowspan", "target", "rel", "datetime", "lang", "dir",
]);

const URL_ATTRS = new Set(["href", "src"]);

function sanitizeUrl(url: string): string {
  const trimmed = url.trim().toLowerCase();
  // Allow relative URLs, anchors, and safe protocols.
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  ) {
    return url;
  }
  // Block javascript:, data:, and anything else suspicious.
  return "";
}

export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";

  // Remove script tags, style tags, and HTML comments entirely.
  let html = dirty
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?<\/embed>/gi, "");

  // Process remaining tags: strip disallowed tags and attributes.
  html = html.replace(/<\/?([a-zA-Z0-9]+)\b([^>]*)>/g, (match, tag, attrs) => {
    const tagName = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) {
      return ""; // Remove disallowed tags entirely.
    }

    // Parse and filter attributes.
    const cleanAttrs = attrs
      .replace(/([a-zA-Z-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g, (_match: string, name: string, value: string) => {
        const attrName = name.toLowerCase();
        if (!ALLOWED_ATTRS.has(attrName)) {
          return "";
        }
        let attrValue = value.replace(/^["']|["']$/g, "");
        if (URL_ATTRS.has(attrName)) {
          attrValue = sanitizeUrl(attrValue);
          if (!attrValue) return "";
        }
        return `${name}="${attrValue.replace(/"/g, "&quot;")}"`;
      })
      .trim();

    const isClosing = match.startsWith("</");
    return isClosing ? `</${tagName}>` : `<${tagName}${cleanAttrs ? " " + cleanAttrs : ""}>`;
  });

  return html;
}

// Match the DOMPurify API surface used in the codebase.
export default { sanitize: sanitizeHtml };
