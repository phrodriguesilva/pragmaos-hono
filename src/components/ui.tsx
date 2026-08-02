import type { FC, PropsWithChildren } from "hono/jsx";

export type BadgeColor = "green" | "red" | "yellow" | "blue" | "gray";

// SkeletonRow — placeholder for table rows while data loads.
export const SkeletonRow: FC<{ cols: number }> = ({ cols }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i}>
        <div class="h-4 bg-gray-100 rounded animate-pulse" style="width: 60%;" />
      </td>
    ))}
  </tr>
);

// LoadingButton — button with Alpine.js loading state (spinner + disabled).
export const LoadingButton: FC<{
  type?: "submit" | "button";
  variant?: "primary" | "secondary";
  children: PropsWithChildren["children"];
  icon?: string;
  loadingText?: string;
}> = ({ type = "submit", variant = "primary", children, icon, loadingText }) => (
  <button
    type={type}
    class={`btn btn-${variant} inline-flex items-center gap-2`}
    {...{ "x-data": "{ loading: false }", "@click": "loading = true", ":disabled": "loading", ":class": "loading ? 'opacity-60 cursor-wait' : ''" }}
  >
    <template {...{ "x-if": "loading" }}>
      <span class="flex items-center gap-2">
        <i class="ph ph-spinner animate-spin" aria-hidden="true" />
        {loadingText ?? "Salvando..."}
      </span>
    </template>
    <template {...{ "x-if": "!loading" }}>
      <span class="flex items-center gap-2">
        {icon ? <i class={`ph ${icon}`} aria-hidden="true" /> : null}
        {children}
      </span>
    </template>
  </button>
);

export const Badge: FC<{ color: BadgeColor; children: PropsWithChildren["children"]; icon?: string }> = ({
  color,
  children,
  icon,
}) => (
  <span class={`badge badge-${color} inline-flex items-center gap-1`}>
    {icon ? <i class={`ph ${icon}`} aria-hidden="true" /> : null}
    {children}
  </span>
);

export type TableColumn = {
  label: string;
  align?: "left" | "center" | "right";
  icon?: string;
};

export type PaginationProps = {
  currentPage: number;
  totalPages: number;
  basePath: string;
  queryParams?: Record<string, string>;
};

export type TableProps = {
  columns: TableColumn[];
  rows: (string | number)[][];
  emptyMsg?: string;
  ariaLabel?: string;
  emptyIcon?: string;
  count?: number;
  countLabel?: string;
  pagination?: PaginationProps;
};

function buildPageUrl(p: PaginationProps, page: number): string {
  const params = new URLSearchParams(p.queryParams ?? {});
  params.set("page", String(page));
  params.set("limit", "20");
  return `${p.basePath}?${params.toString()}`;
}

export const Table: FC<TableProps> = ({ columns, rows, emptyMsg, ariaLabel, emptyIcon, count, countLabel, pagination }) => {
  const showCount = count !== undefined;
  const showPagination = pagination && pagination.totalPages > 1;
  const p = pagination;

  // Build page numbers to display (show up to 5 pages around current).
  let pages: number[] = [];
  if (p) {
    const start = Math.max(1, p.currentPage - 2);
    const end = Math.min(p.totalPages, start + 4);
    for (let i = start; i <= end; i++) pages.push(i);
  }

  return (
    <>
      <div class="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <table class="data-table" aria-label={ariaLabel}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th class={c.align === "center" ? "text-center" : c.align === "right" ? "text-right" : ""}>
                  {c.icon ? <i class={`ph ${c.icon} mr-1`} aria-hidden="true" /> : null}
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colspan={columns.length} class="text-center text-gray-500 py-4">
                  {emptyIcon ? <i class={`ph ${emptyIcon} text-h2 block mb-1 text-gray-300`} aria-hidden="true" /> : null}
                  {emptyMsg ?? "Nenhum registro encontrado."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr>
                  {row.map((cell, i) => (
                    <td
                      class={
                        columns[i]?.align === "center"
                          ? "text-center"
                          : columns[i]?.align === "right"
                            ? "text-right"
                            : ""
                      }
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {showCount || showPagination ? (
        <div class="flex items-center justify-between mt-2">
          {showCount ? (
            <div class="text-body-sm text-gray-500">{count} {countLabel ?? "registro(s)"}</div>
          ) : <div />}
          {showPagination && p ? (
            <div class="flex items-center gap-1">
              {p.currentPage > 1 ? (
                <a href={buildPageUrl(p, p.currentPage - 1)} class="btn btn-secondary btn-sm" aria-label="Pagina anterior">
                  <i class="ph ph-caret-left" aria-hidden="true"></i>
                </a>
              ) : null}
              {pages[0]! > 1 ? (
                <>
                  <a href={buildPageUrl(p, 1)} class="btn btn-secondary btn-sm">1</a>
                  {pages[0]! > 2 ? <span class="text-gray-400 px-1">...</span> : null}
                </>
              ) : null}
              {pages.map((pg) => (
                <a href={buildPageUrl(p, pg)} class={`btn btn-sm ${pg === p.currentPage ? "btn-primary" : "btn-secondary"}`}>{pg}</a>
              ))}
              {pages[pages.length - 1]! < p.totalPages ? (
                <>
                  {pages[pages.length - 1]! < p.totalPages - 1 ? <span class="text-gray-400 px-1">...</span> : null}
                  <a href={buildPageUrl(p, p.totalPages)} class="btn btn-secondary btn-sm">{p.totalPages}</a>
                </>
              ) : null}
              {p.currentPage < p.totalPages ? (
                <a href={buildPageUrl(p, p.currentPage + 1)} class="btn btn-secondary btn-sm" aria-label="Proxima pagina">
                  <i class="ph ph-caret-right" aria-hidden="true"></i>
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
};

export const PageHeader: FC<PropsWithChildren<{ title: string; icon?: string; actions?: () => unknown }>> = ({
  title,
  icon,
  actions,
  children,
}) => (
  <div class="flex items-center justify-between mb-4">
    <div class="flex items-center gap-2">
      {icon ? <i class={`ph-bold ${icon} text-h1 text-carvao-700`} aria-hidden="true" /> : null}
      <div>
        <h1 class="text-h1 font-bold text-gray-900">{title}</h1>
        {children}
      </div>
    </div>
    {actions ? actions() : null}
  </div>
);

export const Panel: FC<PropsWithChildren<{ title?: string; icon?: string }>> = ({ title, icon, children }) => (
  <div class="border border-gray-100 bg-white rounded-xl shadow-sm">
    {title ? (
      <div class="border-b border-gray-100 px-5 py-4 flex items-center gap-2.5">
        {icon ? <i class={`ph ${icon} text-body text-terracota-500`} aria-hidden="true" /> : null}
        <h2 class="text-h3 font-semibold text-gray-800">{title}</h2>
      </div>
    ) : null}
    <div class="p-5">{children}</div>
  </div>
);

export const TextField: FC<{
  label: string;
  id: string;
  name: string;
  type?: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
  step?: string;
  min?: string;
  max?: string;
  icon?: string;
}> = ({ label, id, name, type = "text", value, placeholder, required, error, step, min, max, icon }) => (
  <div class="flex flex-col gap-1">
    <label for={id} class="text-body-sm font-semibold text-gray-700">
      {label}
      {required ? <span class="text-status-red"> *</span> : null}
    </label>
    <div class="relative">
      {icon ? <i class={`ph ${icon} absolute left-2 top-1/2 -translate-y-1/2 text-body text-gray-400`} aria-hidden="true" /> : null}
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        step={step}
        min={min}
        max={max}
        class={`input${icon ? " pl-7" : ""}`}
      />
    </div>
    {error ? <span class="text-body-sm text-status-red">{error}</span> : null}
  </div>
);

export const Select: FC<{
  label: string;
  id: string;
  name: string;
  options: { value: string; label: string }[];
  selected?: string;
  required?: boolean;
  icon?: string;
}> = ({ label, id, name, options, selected, required, icon }) => (
  <div class="flex flex-col gap-1">
    <label for={id} class="text-body-sm font-semibold text-gray-700">
      {label}
      {required ? <span class="text-status-red"> *</span> : null}
    </label>
    <div class="relative">
      {icon ? <i class={`ph ${icon} absolute left-2 top-1/2 -translate-y-1/2 text-body text-gray-400 pointer-events-none`} aria-hidden="true" /> : null}
      <select id={id} name={name} required={required} class={`input${icon ? " pl-7" : ""}`}>
        {options.map((o) => (
          <option value={o.value} selected={o.value === selected}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  </div>
);

// ============================================================
// ComboBox -- searchable dropdown for long dynamic lists
// Uses Alpine.js for search/filter. Hidden input submits value.
// ============================================================

export const ComboBox: FC<{
  label: string;
  id: string;
  name: string;
  options: { value: string; label: string }[];
  selected?: string;
  required?: boolean;
  icon?: string;
  placeholder?: string;
}> = ({ label, id, name, options, selected, required, icon, placeholder = "Buscar..." }) => {
  const selectedOption = options.find((o) => o.value === selected);
  const selectedLabel = selectedOption?.label ?? "";
  const optionsJson = JSON.stringify(options.map((o) => ({ v: o.value, l: o.label })));

  return (
    <div class="flex flex-col gap-1">
      <label for={id} class="text-body-sm font-semibold text-gray-700">
        {label}
        {required ? <span class="text-status-red"> *</span> : null}
      </label>
      <div
        class="combobox"
        role="combobox"
        aria-expanded="false"
        {...{ ":aria-expanded": "open" }}
        aria-haspopup="listbox"
        {...{
          "x-data": `{
            open: false,
            query: '',
            activeIndex: -1,
            selectedValue: ${selected ? `'${selected.replace(/'/g, "\\'")}'` : "''"},
            selectedLabel: ${selectedLabel ? `'${selectedLabel.replace(/'/g, "\\'")}'` : "''"},
            options: ${optionsJson},
            get filtered() {
              if (!this.query) return this.options;
              const q = this.query.toLowerCase();
              return this.options.filter(o => o.l.toLowerCase().includes(q));
            },
            select(opt) {
              this.selectedValue = opt.v;
              this.selectedLabel = opt.l;
              this.open = false;
              this.query = '';
              this.activeIndex = -1;
            },
            navigate(e) {
              if (!this.open) return;
              const len = this.filtered.length;
              if (e.key === 'ArrowDown') { e.preventDefault(); this.activeIndex = Math.min(this.activeIndex + 1, len - 1); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); this.activeIndex = Math.max(this.activeIndex - 1, 0); }
              else if (e.key === 'Enter' && this.activeIndex >= 0) { e.preventDefault(); if (this.filtered[this.activeIndex]) this.select(this.filtered[this.activeIndex]); }
              else if (e.key === 'Escape') { this.open = false; this.activeIndex = -1; }
            }
          }`,
        }}
      >
        {/* Hidden input that submits the actual value */}
        <input type="hidden" name={name} value={selected ?? ""} {...{ ":value": "selectedValue" }} aria-hidden="true" />

        {/* Trigger button */}
        <div
          class="combobox-trigger"
          {...{ tabindex: "0", role: "button", "aria-label": label, "@click": "open = !open; if (open) $nextTick(() => $refs.search.focus())", "@click.away": "open = false", "@keydown.enter.prevent": "open = !open; if (open) $nextTick(() => $refs.search.focus())", "@keydown.space.prevent": "open = !open; if (open) $nextTick(() => $refs.search.focus())" } as Record<string, unknown>}
        >
          {icon ? <i class={`ph ${icon} text-body text-gray-400`} aria-hidden="true" /> : null}
          <span
            class="flex-1 truncate text-left"
            {...{ "x-show": "selectedLabel" }}
          >
            {selectedLabel}
          </span>
          <span
            class="flex-1 truncate text-left text-gray-400"
            {...{ "x-show": "!selectedLabel" }}
            x-cloak
          >
            {placeholder}
          </span>
          <i class="ph ph-caret-down text-body text-gray-400" aria-hidden="true" {...{ ":class": "open ? 'rotate-180' : ''" }} />
        </div>

        {/* Dropdown */}
        <div class="combobox-dropdown" {...{ "x-show": "open" }} x-cloak role="listbox" aria-label={label} {...{ "@keydown": "navigate($event)" }}>
          <input
            type="text"
            x-ref="search"
            class="combobox-search"
            placeholder={placeholder}
            aria-label="Buscar opcoes"
            {...{ "x-model": "query" }}
          />
          <template {...{ "x-for": "(opt, i) in filtered", ":key": "opt.v" }}>
            <div
              class="combobox-option"
              role="option"
              {...{ ":aria-selected": "selectedValue === opt.v" }}
              {...{ ":class": "selectedValue === opt.v ? 'combobox-option-selected' : (i === activeIndex ? 'combobox-option-active' : '')" }}
              {...{ "@click": "select(opt)" }}
              {...{ "@mouseenter": "activeIndex = i" }}
            >
              <span {...{ "x-text": "opt.l" }} />
            </div>
          </template>
          <div class="combobox-empty" {...{ "x-show": "filtered.length === 0" }} x-cloak role="status">
            Nenhum resultado encontrado
          </div>
        </div>
      </div>
    </div>
  );
};


export const Textarea: FC<PropsWithChildren<{
  label: string;
  id: string;
  name: string;
  value?: string;
  rows?: number;
  required?: boolean;
  icon?: string;
  placeholder?: string;
}>> = ({ label, id, name, value, rows = 4, required, placeholder, children }) => (
  <div class="flex flex-col gap-1">
    <label for={id} class="text-body-sm font-semibold text-gray-700">
      {label}
      {required ? <span class="text-status-red"> *</span> : null}
    </label>
    <textarea id={id} name={name} rows={rows} required={required} placeholder={placeholder} class="input">
      {value ?? children}
    </textarea>
  </div>
);

// Button with optional icon. variant: "primary" | "secondary" | "danger"
export const Btn: FC<{
  variant?: "primary" | "secondary" | "danger";
  icon?: string;
  type?: "button" | "submit";
  onclick?: string;
  class?: string;
  children?: PropsWithChildren["children"];
}> = ({ variant = "secondary", icon, type = "button", onclick, class: cls, children }) => (
  <button type={type} onclick={onclick} class={`btn btn-${variant} inline-flex items-center gap-1${cls ? ` ${cls}` : ""}`}>
    {icon ? <i class={`ph ${icon}`} aria-hidden="true" /> : null}
    {children}
  </button>
);

// Link styled as button with optional icon.
export const BtnLink: FC<{
  href: string;
  variant?: "primary" | "secondary" | "danger";
  icon?: string;
  class?: string;
  children?: PropsWithChildren["children"];
}> = ({ href, variant = "secondary", icon, class: cls, children }) => (
  <a href={href} class={`btn btn-${variant} inline-flex items-center gap-1${cls ? ` ${cls}` : ""}`}>
    {icon ? <i class={`ph ${icon}`} aria-hidden="true" /> : null}
    {children}
  </a>
);

export const Spinner: FC = () => (
  <span class="inline-flex items-center gap-1 text-body-sm text-gray-500" aria-label="Carregando">
    <i class="ph ph-circle-notch animate-spin" aria-hidden="true" />
    carregando...
  </span>
);

// ============================================================
// Modal -- simple form popup (Alpine.js controlled)
// ============================================================

export const Modal: FC<{
  id: string;
  title: string;
  icon?: string;
  triggerText: string;
  triggerIcon?: string;
  triggerVariant?: "primary" | "secondary";
  action: string;
  method?: "post" | "get";
  large?: boolean;
  submitLabel?: string;
  submitIcon?: string;
  children: PropsWithChildren["children"];
}> = ({
  id,
  title,
  icon,
  triggerText,
  triggerIcon,
  triggerVariant = "primary",
  action,
  method = "post",
  large,
  submitLabel = "Salvar",
  submitIcon = "ph-floppy-disk",
  children,
}) => (
  <div {...{ "x-data": `{ open: false, previousFocus: null, trapFocus(e) { const panel = this.$refs.panel; if (!panel) return; const focusable = panel.querySelectorAll('input, select, textarea, button:not([disabled]), a[href], [tabindex]:not([tabindex=\"-1\"])'); if (focusable.length === 0) return; const first = focusable[0]; const last = focusable[focusable.length - 1]; if (e.key === 'Tab') { if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } } }` }}>
    <button
      type="button"
      {...{ "@click": "open = true; document.body.classList.add('modal-open'); previousFocus = document.activeElement; $nextTick(() => { const f = $refs.panel?.querySelector('input, select, textarea'); if (f) f.focus(); })" }}
      class={`btn btn-${triggerVariant} inline-flex items-center gap-1`}
    >
      {triggerIcon ? <i class={`ph ${triggerIcon}`} aria-hidden="true" /> : null}
      {triggerText}
    </button>

    <div {...{ "x-show": "open", "@keydown.escape.window": "open = false; document.body.classList.remove('modal-open'); if (previousFocus) previousFocus.focus()", "@keydown.tab": "trapFocus($event)" }} x-cloak class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      <div class={`modal-panel${large ? " modal-lg" : ""}`} {...{ "x-ref": "panel" }}>
        <div class="modal-header">
          <div class="flex items-center gap-2">
            {icon ? <i class={`ph-bold ${icon} text-h3 text-carvao-700`} aria-hidden="true" /> : null}
            <h2 id={`${id}-title`} class="text-h3 font-semibold text-gray-800">{title}</h2>
          </div>
          <button
            type="button"
            {...{ "@click": "open = false; document.body.classList.remove('modal-open'); if (previousFocus) previousFocus.focus()" }}
            aria-label="Fechar"
            class="text-gray-400 hover:text-gray-700"
          >
            <i class="ph ph-x text-h3" aria-hidden="true" />
          </button>
        </div>
        <form method={method} action={action}>
          <div class="modal-body flex flex-col gap-4">
            {children}
          </div>
          <div class="modal-footer">
            <button
              type="button"
              {...{ "@click": "open = false; document.body.classList.remove('modal-open'); if (previousFocus) previousFocus.focus()" }}
              class="btn btn-secondary inline-flex items-center gap-1"
            >
              <i class="ph ph-x" aria-hidden="true" />Cancelar
            </button>
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
              <i class={`ph ${submitIcon}`} aria-hidden="true" />{submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
);

// ============================================================
// WizardModal -- multi-step form popup (Alpine.js controlled)
// ============================================================

export type WizardStep = {
  label: string;
  icon?: string;
  fields: PropsWithChildren["children"];
};

export const WizardModal: FC<{
  id: string;
  title: string;
  icon?: string;
  triggerText: string;
  triggerIcon?: string;
  triggerVariant?: "primary" | "secondary";
  action: string;
  method?: "post" | "get";
  large?: boolean;
  steps: WizardStep[];
  submitLabel?: string;
  submitIcon?: string;
}> = ({
  id,
  title,
  icon,
  triggerText,
  triggerIcon,
  triggerVariant = "primary",
  action,
  method = "post",
  large,
  steps,
  submitLabel = "Salvar",
  submitIcon = "ph-floppy-disk",
}) => {
  const stepCount = steps.length;
  const stepNumbers = Array.from({ length: stepCount }, (_, i) => i).join(", ");

  return (
    <div {...{ "x-data": `{ open: false, step: 0 }` }}>
      <button
        type="button"
        {...{ "@click": `open = true; step = 0; document.body.classList.add('modal-open')` }}
        class={`btn btn-${triggerVariant} inline-flex items-center gap-1`}
      >
        {triggerIcon ? <i class={`ph ${triggerIcon}`} aria-hidden="true" /> : null}
        {triggerText}
      </button>

      <div {...{ "x-show": "open" }} x-cloak class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div class={`modal-panel${large ? " modal-lg" : ""}`}>
          <div class="modal-header">
            <div class="flex items-center gap-2">
              {icon ? <i class={`ph-bold ${icon} text-h3 text-carvao-700`} aria-hidden="true" /> : null}
              <h2 id={`${id}-title`} class="text-h3 font-semibold text-gray-800">{title}</h2>
            </div>
            <button
              type="button"
              {...{ "@click": "open = false; document.body.classList.remove('modal-open')" }}
              aria-label="Fechar"
              class="text-gray-400 hover:text-gray-700"
            >
              <i class="ph ph-x text-h3" aria-hidden="true" />
            </button>
          </div>

          {/* Step indicator */}
          <div class="wizard-steps">
            {steps.map((s, i) => (
              <div
                class={`wizard-step ${i === 0 ? "wizard-step-active" : "wizard-step-pending"}`}
                {...{ ":class": `step === ${i} ? 'wizard-step-active' : step > ${i} ? 'wizard-step-done' : 'wizard-step-pending'` }}
              >
                <span
                  class={`wizard-step-number wizard-step-number-${i === 0 ? "active" : "pending"}`}
                  {...{ ":class": `step === ${i} ? 'wizard-step-number-active' : step > ${i} ? 'wizard-step-number-done' : 'wizard-step-number-pending'` }}
                >
                  <span {...{ "x-show": `step <= ${i}` }}>{i + 1}</span>
                  <i class="ph ph-check" aria-hidden="true" {...{ "x-show": `step > ${i}` }} x-cloak />
                </span>
                {s.icon ? <i class={`ph ${s.icon}`} aria-hidden="true" /> : null}
                {s.label}
              </div>
            ))}
          </div>

          <form method={method} action={action}>
            {/* Step content */}
            {steps.map((s, i) => (
              <div {...{ "x-show": `step === ${i}` }} x-cloak>
                <div class="modal-body flex flex-col gap-4">
                  {s.fields}
                </div>
              </div>
            ))}

            <div class="modal-footer">
              <button
                type="button"
                {...{ "@click": "open = false; document.body.classList.remove('modal-open')" }}
                class="btn btn-secondary inline-flex items-center gap-1"
              >
                <i class="ph ph-x" aria-hidden="true" />Cancelar
              </button>
              <button
                type="button"
                {...{ "@click": "step > 0 ? step-- : null" }}
                {...{ "x-show": "step > 0" }}
                x-cloak
                class="btn btn-secondary inline-flex items-center gap-1"
              >
                <i class="ph ph-arrow-left" aria-hidden="true" />Voltar
              </button>
              <button
                type="button"
                {...{ "@click": `step < ${stepCount - 1} ? step++ : null` }}
                {...{ "x-show": `step < ${stepCount - 1}` }}
                x-cloak
                class="btn btn-primary inline-flex items-center gap-1"
              >
                Proximo<i class="ph ph-arrow-right" aria-hidden="true" />
              </button>
              <button
                type="submit"
                {...{ "x-show": `step === ${stepCount - 1}` }}
                x-cloak
                class="btn btn-primary inline-flex items-center gap-1"
              >
                <i class={`ph ${submitIcon}`} aria-hidden="true" />{submitLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// EditModal -- modal that loads form content via fetch
// Used for edit forms: fetches HTML from a URL and injects it
// ============================================================

export const EditModal: FC<{
  id: string;
  title: string;
  icon?: string;
  large?: boolean;
}> = ({
  id,
  title,
  icon,
  large,
}) => (
  <div {...{ "x-data": `{ open: false, loading: false }` }}>
    <div {...{ "x-show": "open" }} x-cloak class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      <div class={`modal-panel${large ? " modal-lg" : ""}`}>
        <div class="modal-header">
          <div class="flex items-center gap-2">
            {icon ? <i class={`ph-bold ${icon} text-h3 text-carvao-700`} aria-hidden="true" /> : null}
            <h2 id={`${id}-title`} class="text-h3 font-semibold text-gray-800">{title}</h2>
          </div>
          <button
            type="button"
            {...{ "@click": "open = false; document.body.classList.remove('modal-open')" }}
            aria-label="Fechar"
            class="text-gray-400 hover:text-gray-700"
          >
            <i class="ph ph-x text-h3" aria-hidden="true" />
          </button>
        </div>
        <div {...{ "x-ref": "body" }}>
          <div class="modal-body text-center text-gray-500" {...{ "x-show": "loading" }} x-cloak>
            <i class="ph ph-circle-notch animate-spin text-h2 block mb-2" aria-hidden="true" />
            Carregando...
          </div>
          <div {...{ "x-show": "!loading" }} x-cloak {...{ "x-html": "content" }}></div>
        </div>
      </div>
    </div>
  </div>
);

// Helper: generates the Alpine @click handler for opening an edit modal with fetched content.
// Usage: <button @click={editModalOpen("editClientModal", `/clients/${c.id}/edit-form`)}>
export function editModalOpen(modalId: string, fetchUrl: string): string {
  return `const m = document.querySelector('[x-data]').__x.$data; ${modalId} = true; document.body.classList.add('modal-open'); fetch('${fetchUrl}').then(r => r.text()).then(h => { content = h; loading = false; })`;
}

// ---------------------------------------------------------------------------
// FileUpload — reutilizavel para upload de arquivos via Supabase Storage.
// Usa Alpine.js para drag-and-drop, progress bar, e preview de imagem.
// Faz POST multipart para /upload e recebe de volta a URL publica + path.
// ---------------------------------------------------------------------------

export const FileUpload: FC<{
  label: string;
  id: string;
  name: string; // nome do hidden input que guarda o path retornado
  accept?: string; // ex: ".pdf,.jpg,.png" ou "image/*"
  maxSize?: number; // em MB (default 10)
  required?: boolean;
  value?: string; // path/URL existente
  icon?: string;
  help?: string;
}> = ({ label, id, name, accept = "*", maxSize = 10, required, value, icon = "ph-upload-simple", help }) => (
  <div class="flex flex-col gap-1">
    <label for={id} class="text-body-sm font-semibold text-gray-700">
      {label}
      {required ? <span class="text-status-red"> *</span> : null}
    </label>
    <div
      {...{ "x-data": `{ uploading: false, progress: 0, fileName: '', fileUrl: '${(value ?? "").replace(/'/g, "\\'")}', error: '', dragOver: false }` }}
      {...{ "@dragover.prevent": "dragOver = true" }}
      {...{ "@dragleave.prevent": "dragOver = false" }}
      {...{ "@drop.prevent": "if ($event.dataTransfer.files.length) { $refs.fileInput.files = $event.dataTransfer.files; $dispatch('change') }" }}
      class={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${required ? "border-terracota-400" : "border-gray-300"}`}
      {...{ ":class": "dragOver ? 'border-terracota-600 bg-terracota-50' : (error ? 'border-status-red bg-red-50' : 'border-gray-300')" }}
    >
      {/* Hidden input que guarda o path retornado pelo servidor */}
      <input type="hidden" name={name} {...{ ":value": "fileUrl" }} />

      {/* File input real (escondido) */}
      <input
        type="file"
        accept={accept}
        {...{ "x-ref": "fileInput" }}
        class="hidden"
        {...{ "@change": `
          const file = $event.target.files[0];
          if (!file) return;
          error = '';
          if (file.size > ${maxSize} * 1024 * 1024) {
            error = 'Arquivo muito grande. Maximo: ${maxSize}MB.';
            return;
          }
          uploading = true;
          progress = 0;
          fileName = file.name;
          const formData = new FormData();
          formData.append('file', file);
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) progress = Math.round((e.loaded / e.total) * 100);
          });
          xhr.addEventListener('load', () => {
            uploading = false;
            if (xhr.status >= 200 && xhr.status < 300) {
              const res = JSON.parse(xhr.responseText);
              fileUrl = res.path || res.url || '';
              error = '';
            } else {
              try {
                const res = JSON.parse(xhr.responseText);
                error = res.error || 'Erro no upload.';
              } catch(e) {
                error = 'Erro no upload (status ' + xhr.status + ').';
              }
            }
          });
          xhr.addEventListener('error', () => {
            uploading = false;
            error = 'Erro de conexao no upload.';
          });
          xhr.open('POST', '/upload');
          xhr.send(formData);
        ` }}
      />

      {/* Estado: vazio (drag-drop area) */}
      <div {...{ "x-show": "!uploading && !fileUrl && !error" }}>
        <i class={`ph ${icon} text-h2 text-gray-400 block mb-2`} aria-hidden="true"></i>
        <p class="text-body-sm text-gray-500 mb-2">Arraste um arquivo aqui ou</p>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          {...{ "@click": "$refs.fileInput.click()" }}
        >
          <i class="ph ph-folder-open" aria-hidden="true"></i> Selecionar arquivo
        </button>
        {help ? <p class="text-body-xs text-gray-400 mt-2">{help}</p> : null}
      </div>

      {/* Estado: uploading (progress bar) */}
      <div {...{ "x-show": "uploading" }} x-cloak>
        <i class="ph ph-spinner animate-spin text-h2 text-carvao-600 block mb-2" aria-hidden="true"></i>
        <p class="text-body-sm text-gray-700 mb-2" {...{ "x-text": "'Enviando ' + fileName + '...'" }}></p>
        <div class="w-full bg-gray-200 rounded-full h-2">
          <div
            class="bg-terracota-600 h-2 rounded-full transition-all"
            {...{ ":style": `'width: ' + progress + '%'` }}
          ></div>
        </div>
        <p class="text-body-xs text-gray-500 mt-1" {...{ "x-text": "progress + '%'" }}></p>
      </div>

      {/* Estado: arquivo carregado */}
      <div {...{ "x-show": "!uploading && fileUrl && !error" }} x-cloak class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <i class="ph ph-check-circle text-h4 text-status-green" aria-hidden="true"></i>
          <span class="text-body-sm text-gray-700 truncate" {...{ "x-text": "fileName || fileUrl" }}></span>
        </div>
        <div class="flex gap-1 shrink-0">
          <button type="button" class="btn btn-secondary btn-sm" {...{ "@click": "$refs.fileInput.click()" }}>
            <i class="ph ph-arrow-clockwise" aria-hidden="true"></i> Trocar
          </button>
          <button
            type="button"
            class="btn btn-danger btn-sm"
            {...{ "@click": "fileUrl = ''; fileName = ''; $refs.fileInput.value = ''" }}
          >
            <i class="ph ph-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      {/* Estado: erro */}
      <div {...{ "x-show": "!uploading && error" }} x-cloak class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <i class="ph ph-warning-circle text-h4 text-status-red" aria-hidden="true"></i>
          <span class="text-body-sm text-status-red" {...{ "x-text": "error" }}></span>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" {...{ "@click": "error = ''; $refs.fileInput.click()" }}>
          <i class="ph ph-arrow-clockwise" aria-hidden="true"></i> Tentar novamente
        </button>
      </div>
    </div>
  </div>
);
