// WYSIWYG editor component for legal documents.
// Uses contenteditable with execCommand for formatting.
// PragmaOS 2.

import type { FC } from "hono/jsx";

// Basic HTML sanitizer — removes script tags, event handlers, and dangerous elements.
// For production, consider using DOMPurify on the client side as well.
function sanitizeHtml(html: string): string {
  if (!html) return "";
  return html
    // Remove script tags and their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove style tags
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    // Remove iframe, object, embed tags
    .replace(/<\/?(iframe|object|embed|applet|meta|link|base|form)\b[^>]*>/gi, "")
    // Remove on* event handlers (onclick, onload, onerror, etc.)
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    // Remove javascript: URLs
    .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
    .replace(/src\s*=\s*"javascript:[^"]*"/gi, "")
    // Remove data: URLs in src (can be used for XSS)
    .replace(/src\s*=\s*"data:[^"]*"/gi, "")
    // Remove vbscript: URLs
    .replace(/href\s*=\s*"vbscript:[^"]*"/gi, 'href="#"');
}

interface EditorProps {
  id: string;
  name: string;
  label?: string;
  value?: string;
  placeholder?: string;
  rows?: number;
}

export const WysiwygEditor: FC<EditorProps> = ({
  id,
  name,
  label,
  value = "",
  placeholder = "",
  rows = 15,
}) => {
  const toolbarBtns = [
    { cmd: "bold", icon: "ph-text-b", label: "Negrito" },
    { cmd: "italic", icon: "ph-text-italic", label: "Italico" },
    { cmd: "underline", icon: "ph-text-underline", label: "Sublinhado" },
    { cmd: "strikeThrough", icon: "ph-text-strikethrough", label: "Tachado" },
    { sep: true },
    { cmd: "justifyLeft", icon: "ph-text-align-left", label: "Alinhar a esquerda" },
    { cmd: "justifyCenter", icon: "ph-text-align-center", label: "Centralizar" },
    { cmd: "justifyRight", icon: "ph-text-align-right", label: "Alinhar a direita" },
    { cmd: "justifyFull", icon: "ph-text-align-justify", label: "Justificar" },
    { sep: true },
    { cmd: "insertUnorderedList", icon: "ph-list-dashes", label: "Lista" },
    { cmd: "insertOrderedList", icon: "ph-list-numbers", label: "Lista numerada" },
    { sep: true },
    { cmd: "formatBlock", value: "h2", icon: "ph-text-h", label: "Titulo" },
    { cmd: "formatBlock", value: "p", icon: "ph-text-indent", label: "Paragrafo" },
  ];

  return (
    <div>
      {label ? <label for={id} class="text-body-sm font-semibold text-gray-700 block mb-2">{label}</label> : null}
      <div
        {...{ "x-data": `{ content: ${JSON.stringify(value)}, exec(cmd, val) { document.execCommand(cmd, false, val || null); this.syncHidden(); }, syncHidden() { this.content = document.getElementById('${id}-editor').innerHTML; document.getElementById('${id}-hidden').value = this.content; } }` }}
        class="border border-gray-200 rounded-xl overflow-hidden focus-within:border-[#b0ccff] focus-within:ring-2 focus-within:ring-[#4d8bff]/20"
      >
        {/* Toolbar */}
        <div class="flex items-center gap-1 p-2 border-b border-gray-100 bg-gray-50 flex-wrap">
          {toolbarBtns.map((btn, i) =>
            btn.sep ? (
              <div key={i} class="w-px h-5 bg-gray-200 mx-1"></div>
            ) : (
              <button
                key={i}
                type="button"
                {...{ "@click": `exec('${btn.cmd}'${btn.value ? `, '${btn.value}'` : ""})` }}
                title={btn.label}
                aria-label={btn.label}
                class="p-1.5 rounded hover:bg-white text-gray-600 hover:text-[#0568ff] transition-colors"
              >
                <i class={`ph ${btn.icon} text-body`} aria-hidden="true"></i>
              </button>
            )
          )}
        </div>
        {/* Editable area */}
        <div
          id={`${id}-editor`}
          contenteditable={true}
          {...{ "@input": "syncHidden()" }}
          class="p-4 outline-none prose prose-sm max-w-none min-h-96 text-body text-gray-800"
          style={`min-height: ${rows * 1.5}rem;`}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }}
        />
        {/* Hidden input to submit with form */}
        <input
          type="hidden"
          id={`${id}-hidden`}
          name={name}
          value={value}
        />
      </div>
    </div>
  );
};
