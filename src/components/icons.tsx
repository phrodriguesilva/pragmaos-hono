import type { FC, PropsWithChildren } from "hono/jsx";

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
};

export const MODULES: SidebarModule[] = [
  { key: "dashboard", label: "Painel", href: "/" },
  { key: "clients", label: "Clientes", href: "/clients" },
  { key: "cases", label: "Processos", href: "/cases" },
  { key: "proceedings", label: "Andamentos", href: "/proceedings" },
  { key: "deadlines", label: "Prazos", href: "/deadlines" },
  { key: "hearings", label: "Audiencias", href: "/hearings" },
  { key: "communications", label: "Comunicacao", href: "/communications" },
  { key: "finance", label: "Financeiro", href: "/finance" },
  { key: "documents", label: "Documentos", href: "/documents" },
  { key: "reports", label: "Relatorios", href: "/reports" },
  { key: "users", label: "Usuarios", href: "/users" },
  { key: "audit", label: "Auditoria", href: "/audit" },
];

export const Sidebar: FC<PropsWithChildren<{ active: ModuleKey }>> = ({ active }) => (
  <aside class="fixed inset-y-0 left-0 w-sidebar bg-navy-600 flex flex-col z-20">
    <div class="h-12 flex items-center border-b border-navy-700 px-4">
      <span class="text-h3 font-semibold text-white">PragmaOS</span>
    </div>
    <nav class="flex-1 flex flex-col overflow-y-auto">
      {MODULES.map((m) => (
        <a
          href={m.href}
          class={`block px-4 py-2 text-body-sm text-white hover:bg-navy-700 focus:outline-none focus:shadow-focus${
            m.key === active ? " bg-navy-700 font-semibold" : ""
          }`}
          aria-current={m.key === active ? "page" : undefined}
        >
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
      <input
        type="search"
        placeholder="Buscar..."
        aria-label="Buscar"
        class="border border-navy-700 bg-navy-800 text-body-sm text-white px-2 py-1 focus:shadow-focus w-48"
      />
      <div {...{ "x-data": "{ open: false }" }} class="relative">
        <button
          {...{ "@click": "open = !open" }}
          aria-label="Menu do usuario"
          aria-haspopup="menu"
          class="text-body-sm text-white hover:text-navy-200 flex items-center gap-1"
        >
          {userName}
          {userRole ? ` (${userRole})` : ""}
        </button>
        <div
          {...{ "x-show": "open", "@click.outside": "open = false", "@keydown.escape.window": "open = false" }}
          role="menu"
          class="absolute right-0 top-full mt-1 border border-border-strong bg-white text-body-sm text-gray-800 min-w-32"
        >
          <a href="/perfil" role="menuitem" class="block px-3 py-2 hover:bg-gray-100">
            Perfil
          </a>
          <a href="/logout" role="menuitem" class="block px-3 py-2 hover:bg-gray-100">
            Sair
          </a>
        </div>
      </div>
    </div>
  </header>
);
