import type { FC, PropsWithChildren } from "hono/jsx";

// Phosphor Icons web font: https://phosphoricons.com
// Usage: <Icon name="ph-house" /> or <Icon name="ph-house" weight="bold" />

export type IconWeight = "regular" | "bold" | "fill" | "duotone" | "light" | "thin";

export const Icon: FC<{ name: string; weight?: IconWeight; class?: string; size?: string }> = ({
  name,
  weight = "regular",
  class: cls,
  size,
}) => {
  const weightClass = weight === "regular" ? "ph" : `ph-${weight}`;
  const sizeStyle = size ? `font-size:${size}` : undefined;
  return <i class={`${weightClass} ${name}${cls ? ` ${cls}` : ""}`} style={sizeStyle} aria-hidden="true" />;
};

export type ModuleKey =
  | "dashboard"
  | "clients"
  | "cases"
  | "proceedings"
  | "deadlines"
  | "hearings"
  | "communications"
  | "finance"
  | "documents"
  | "reports"
  | "users"
  | "audit";

export type SidebarModule = {
  key: ModuleKey;
  label: string;
  href: string;
  icon: string;
};

export const MODULES: SidebarModule[] = [
  { key: "dashboard", label: "Painel", href: "/", icon: "ph-squares-four" },
  { key: "clients", label: "Clientes", href: "/clients", icon: "ph-users" },
  { key: "cases", label: "Processos", href: "/cases", icon: "ph-folder-open" },
  { key: "proceedings", label: "Andamentos", href: "/proceedings", icon: "ph-scales" },
  { key: "deadlines", label: "Prazos", href: "/deadlines", icon: "ph-clock-countdown" },
  { key: "hearings", label: "Audiencias", href: "/hearings", icon: "ph-gavel" },
  { key: "communications", label: "Comunicacao", href: "/communications", icon: "ph-chats-circle" },
  { key: "finance", label: "Financeiro", href: "/finance", icon: "ph-currency-dollar" },
  { key: "documents", label: "Documentos", href: "/documents", icon: "ph-file-text" },
  { key: "reports", label: "Relatorios", href: "/reports", icon: "ph-chart-bar" },
  { key: "users", label: "Usuarios", href: "/users", icon: "ph-user-circle-gear" },
  { key: "audit", label: "Auditoria", href: "/audit", icon: "ph-shield-check" },
];

export const Sidebar: FC<PropsWithChildren<{ active: ModuleKey }>> = ({ active }) => (
  <aside class="fixed inset-y-0 left-0 w-sidebar bg-navy-600 flex flex-col z-20">
    <div class="h-12 flex items-center gap-2 border-b border-navy-700 px-4">
      <i class="ph-bold ph-scales text-h2 text-white" aria-hidden="true" />
      <span class="text-h3 font-semibold text-white">PragmaOS</span>
    </div>
    <nav class="flex-1 flex flex-col overflow-y-auto">
      {MODULES.map((m) => (
        <a
          href={m.href}
          class={`flex items-center gap-2 px-4 py-2 text-body-sm text-white hover:bg-navy-700 focus:outline-none focus:shadow-focus${
            m.key === active ? " bg-navy-700 font-semibold" : ""
          }`}
          aria-current={m.key === active ? "page" : undefined}
        >
          <i class={`ph ${m.icon} text-body`} aria-hidden="true" />
          {m.label}
        </a>
      ))}
    </nav>
    <div class="border-t border-navy-700 px-4 py-2 text-body-sm text-navy-300">v0.1.0</div>
  </aside>
);

export const Topbar: FC<{ firmName?: string; userName: string; userRole?: string }> = ({
  firmName,
  userName,
  userRole,
}) => (
  <header class="w-full bg-navy-600 flex items-center justify-between px-4 py-2 sticky top-0 z-30">
    <span class="text-h3 text-white font-semibold">{firmName ?? "PragmaOS"}</span>
    <div class="flex items-center gap-4">
      <div class="relative">
        <i class="ph ph-magnifying-glass absolute left-2 top-1/2 -translate-y-1/2 text-body-sm text-navy-300" aria-hidden="true" />
        <input
          type="search"
          placeholder="Buscar..."
          aria-label="Buscar"
          class="border border-navy-700 bg-navy-800 text-body-sm text-white pl-7 pr-2 py-1 focus:shadow-focus w-48"
        />
      </div>
      <div {...{ "x-data": "{ open: false }" }} class="relative">
        <button
          {...{ "@click": "open = !open" }}
          aria-label="Menu do usuario"
          aria-haspopup="menu"
          class="flex items-center gap-1 text-body-sm text-white hover:text-navy-200"
        >
          <i class="ph ph-user-circle text-h3" aria-hidden="true" />
          {userName}
          {userRole ? ` (${userRole})` : ""}
        </button>
        <div
          {...{ "x-show": "open", "@click.outside": "open = false", "@keydown.escape.window": "open = false" }}
          role="menu"
          class="absolute right-0 top-full mt-1 border border-border-strong bg-white text-body-sm text-gray-800 min-w-32"
        >
          <a href="/perfil" role="menuitem" class="flex items-center gap-2 px-3 py-2 hover:bg-gray-100">
            <i class="ph ph-user" aria-hidden="true" />Perfil
          </a>
          <a href="/logout" role="menuitem" class="flex items-center gap-2 px-3 py-2 hover:bg-gray-100">
            <i class="ph ph-sign-out" aria-hidden="true" />Sair
          </a>
        </div>
      </div>
    </div>
  </header>
);
