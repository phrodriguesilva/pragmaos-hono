import type { FC, PropsWithChildren } from "hono/jsx";

export type BadgeColor = "green" | "red" | "yellow" | "blue" | "gray";

export const Badge: FC<{ color: BadgeColor; children: PropsWithChildren["children"] }> = ({
  color,
  children,
}) => <span class={`badge badge-${color}`}>{children}</span>;

export type TableColumn = {
  label: string;
  align?: "left" | "center" | "right";
};

export type TableProps = {
  columns: TableColumn[];
  rows: (string | number)[][];
  emptyMsg?: string;
  ariaLabel?: string;
};

export const Table: FC<TableProps> = ({ columns, rows, emptyMsg, ariaLabel }) => (
  <table class="data-table" aria-label={ariaLabel}>
    <thead>
      <tr>
        {columns.map((c) => (
          <th class={c.align === "center" ? "text-center" : c.align === "right" ? "text-right" : ""}>
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.length === 0 ? (
        <tr>
          <td colspan={columns.length} class="text-center text-gray-500 py-4">
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

export const PageHeader: FC<PropsWithChildren<{ title: string; actions?: () => unknown }>> = ({
  title,
  actions,
  children,
}) => (
  <div class="flex items-center justify-between mb-4">
    <div>
      <h1 class="text-h1 font-bold text-gray-900">{title}</h1>
      {children}
    </div>
    {actions ? actions() : null}
  </div>
);

export const Panel: FC<PropsWithChildren<{ title?: string }>> = ({ title, children }) => (
  <div class="border border-border bg-white">
    {title ? (
      <div class="border-b border-border-strong px-4 py-2 bg-gray-50">
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
}> = ({ label, id, name, type = "text", value, placeholder, required, error, step }) => (
  <div class="flex flex-col gap-1">
    <label for={id} class="text-body-sm font-semibold text-gray-700">
      {label}
      {required ? <span class="text-status-red"> *</span> : null}
    </label>
    <input
      id={id}
      name={name}
      type={type}
      value={value}
      placeholder={placeholder}
      required={required}
      step={step}
      class="input"
    />
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
}> = ({ label, id, name, options, selected, required }) => (
  <div class="flex flex-col gap-1">
    <label for={id} class="text-body-sm font-semibold text-gray-700">
      {label}
      {required ? <span class="text-status-red"> *</span> : null}
    </label>
    <select id={id} name={name} required={required} class="input">
      {options.map((o) => (
        <option value={o.value} selected={o.value === selected}>
          {o.label}
        </option>
      ))}
    </select>
  </div>
);

export const Textarea: FC<PropsWithChildren<{
  label: string;
  id: string;
  name: string;
  value?: string;
  rows?: number;
  required?: boolean;
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

export const Spinner: FC = () => (
  <span class="inline-block text-body-sm text-gray-500" aria-label="Carregando">
    carregando...
  </span>
);
