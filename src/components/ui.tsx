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
      {icon ? <i class={`ph-bold ${icon} text-h1 text-navy-700`} aria-hidden="true" /> : null}
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
        {icon ? <i class={`ph ${icon} text-body text-navy-600`} aria-hidden="true" /> : null}
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
