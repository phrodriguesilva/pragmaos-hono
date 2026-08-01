import type { FC, PropsWithChildren } from "hono/jsx";

export type BadgeColor = "green" | "red" | "yellow" | "blue" | "gray";

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

export type TableProps = {
  columns: TableColumn[];
  rows: (string | number)[][];
  emptyMsg?: string;
  ariaLabel?: string;
  emptyIcon?: string;
};

export const Table: FC<TableProps> = ({ columns, rows, emptyMsg, ariaLabel, emptyIcon }) => (
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
);

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
  <div class="border border-border bg-white">
    {title ? (
      <div class="border-b border-border-strong px-4 py-2 bg-gray-50 flex items-center gap-2">
        {icon ? <i class={`ph ${icon} text-body text-carvao-600`} aria-hidden="true" /> : null}
        <h2 class="text-h3 font-semibold text-gray-800">{title}</h2>
      </div>
    ) : null}
    <div class="p-4">{children}</div>
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

export const Textarea: FC<PropsWithChildren<{
  label: string;
  id: string;
  name: string;
  value?: string;
  rows?: number;
  required?: boolean;
  icon?: string;
}>> = ({ label, id, name, value, rows = 4, required, children }) => (
  <div class="flex flex-col gap-1">
    <label for={id} class="text-body-sm font-semibold text-gray-700">
      {label}
      {required ? <span class="text-status-red"> *</span> : null}
    </label>
    <textarea id={id} name={name} rows={rows} required={required} class="input">
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
  <div {...{ "x-data": `{ open: false }` }}>
    <button
      type="button"
      {...{ "@click": "open = true; document.body.classList.add('modal-open')" }}
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
        <form method={method} action={action}>
          <div class="modal-body flex flex-col gap-4">
            {children}
          </div>
          <div class="modal-footer">
            <button
              type="button"
              {...{ "@click": "open = false; document.body.classList.remove('modal-open')" }}
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
