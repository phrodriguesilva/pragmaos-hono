import type { FC, PropsWithChildren } from "hono/jsx";

// Phosphor Icons web font: https://phosphoricons.com
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

// --- Hierarchical sidebar menu ---

export type MenuChild = {
  key: string;
  label: string;
  href: string;
  icon: string;
};

export type MenuGroup = {
  key: string;
  label: string;
  icon: string;
  children: MenuChild[];
};

export type MenuTopLink = {
  key: string;
  label: string;
  href: string;
  icon: string;
};

export type MenuItem = MenuTopLink | MenuGroup;

function isGroup(item: MenuItem): item is MenuGroup {
  return "children" in item;
}

// Full menu structure matching the proposed architecture.
export const MENU: MenuItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/", icon: "ph-squares-four" },
  {
    key: "crm",
    label: "CRM",
    icon: "ph-users-three",
    children: [
      { key: "leads", label: "Leads", href: "/leads", icon: "ph-user-plus" },
      { key: "clients", label: "Clientes", href: "/clients", icon: "ph-users" },
      { key: "companies", label: "Empresas", href: "/companies", icon: "ph-building" },
    ],
  },
  {
    key: "processos",
    label: "Processos",
    icon: "ph-scales",
    children: [
      { key: "cases", label: "Processos", href: "/cases", icon: "ph-folder-open" },
      { key: "proceedings", label: "Andamentos", href: "/proceedings", icon: "ph-list-dashes" },
      { key: "deadlines", label: "Prazos", href: "/deadlines", icon: "ph-clock-countdown" },
      { key: "hearings", label: "Audiencias", href: "/hearings", icon: "ph-gavel" },
      { key: "tasks", label: "Tarefas", href: "/tasks", icon: "ph-check-square" },
    ],
  },
  {
    key: "documentos",
    label: "Documentos",
    icon: "ph-file-text",
    children: [
      { key: "documents", label: "Arquivos", href: "/documents", icon: "ph-folder" },
      { key: "templates", label: "Modelos", href: "/templates", icon: "ph-files" },
      { key: "signatures", label: "Assinaturas", href: "/signatures", icon: "ph-pen-nib" },
    ],
  },
  {
    key: "comunicacao",
    label: "Comunicacao",
    icon: "ph-chats-circle",
    children: [
      { key: "whatsapp", label: "WhatsApp", href: "/whatsapp", icon: "ph-whatsapp-logo" },
      { key: "emails", label: "E-mails", href: "/emails", icon: "ph-envelope" },
      { key: "messages", label: "Mensagens", href: "/messages", icon: "ph-chat-circle" },
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    icon: "ph-currency-dollar",
    children: [
      { key: "honorarios", label: "Honorarios", href: "/honorarios", icon: "ph-hand-coins" },
      { key: "billing", label: "Cobrancas", href: "/billing", icon: "ph-receipt" },
      { key: "cashflow", label: "Fluxo de Caixa", href: "/cashflow", icon: "ph-chart-line-up" },
      { key: "finance-reports", label: "Relatorios", href: "/finance-reports", icon: "ph-chart-pie" },
    ],
  },
  {
    key: "ia",
    label: "Inteligencia Artificial",
    icon: "ph-robot",
    children: [
      { key: "ai-assistant", label: "Assistente Juridico", href: "/ai-assistant", icon: "ph-chats-teardrop" },
      { key: "ai-summaries", label: "Resumos", href: "/ai-summaries", icon: "ph-sparkle" },
      { key: "ai-jurisprudence", label: "Jurisprudencia", href: "/ai-jurisprudence", icon: "ph-books" },
      { key: "ai-petitions", label: "Gerar Peticoes", href: "/ai-petitions", icon: "ph-file-arrow-up" },
    ],
  },
  { key: "reports", label: "BI e Relatorios", href: "/reports", icon: "ph-chart-bar" },
  { key: "portal", label: "Portal do Cliente", href: "/portal", icon: "ph-globe" },
  {
    key: "admin",
    label: "Administracao",
    icon: "ph-gear",
    children: [
      { key: "users", label: "Usuarios", href: "/users", icon: "ph-user-circle-gear" },
      { key: "teams", label: "Equipes", href: "/teams", icon: "ph-users-four" },
      { key: "permissions", label: "Permissoes", href: "/permissions", icon: "ph-key" },
      { key: "integrations", label: "Integracoes", href: "/integrations", icon: "ph-plugs-connected" },
      { key: "audit", label: "Auditoria", href: "/audit", icon: "ph-shield-check" },
    ],
  },
];

// Flat set of all active keys (for determining which group should be expanded).
function keysOfGroup(g: MenuGroup): string[] {
  return g.children.map((c) => c.key);
}

export type ModuleKey = string; // now any string key from the menu

export const Sidebar: FC<{ active: string }> = ({ active }) => {
  // Determine which group contains the active child.
  const activeGroup = MENU.find(
    (item) => isGroup(item) && keysOfGroup(item).includes(active),
  );

  return (
    <aside class="fixed inset-y-0 left-0 w-sidebar bg-navy-600 flex flex-col z-20 overflow-y-auto">
      <div class="h-12 flex items-center gap-2 border-b border-navy-700 px-4 shrink-0">
        <i class="ph-bold ph-scales text-h2 text-white" aria-hidden="true" />
        <span class="text-h3 font-semibold text-white">PragmaOS</span>
      </div>
      <nav class="flex-1 flex flex-col py-1">
        {MENU.map((item) => {
          if (!isGroup(item)) {
            // Top-level link (Dashboard, BI, Portal)
            const isActive = active === item.key;
            return (
              <a
                href={item.href}
                class={`flex items-center gap-2 px-4 py-2 text-body-sm text-white hover:bg-navy-700${
                  isActive ? " bg-navy-700 font-semibold border-l-2 border-white" : ""
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <i class={`ph ${item.icon} text-body`} aria-hidden="true" />
                {item.label}
              </a>
            );
          }

          // Collapsible group
          const groupKey = item.key;
          const isExpanded = activeGroup?.key === groupKey;
          return (
            <div {...{ "x-data": `{ open: ${isExpanded ? "true" : "false"} }` }} class="flex flex-col">
              <button
                {...{ "@click": "open = !open" }}
                class={`flex items-center justify-between px-4 py-2 text-body-sm text-white hover:bg-navy-700 w-full${
                  isExpanded ? " bg-navy-700/50" : ""
                }`}
              >
                <span class="flex items-center gap-2">
                  <i class={`ph ${item.icon} text-body`} aria-hidden="true" />
                  {item.label}
                </span>
                <i {...{ ":class": "open ? 'ph ph-caret-up' : 'ph ph-caret-down'" }} class="ph ph-caret-down text-body-sm" aria-hidden="true" />
              </button>
              <div {...{ "x-show": "open", "x-transition": "" }} class="flex flex-col">
                {item.children.map((child) => {
                  const isActive = active === child.key;
                  return (
                    <a
                      href={child.href}
                      class={`flex items-center gap-2 pl-8 pr-4 py-1.5 text-body-sm text-navy-200 hover:text-white hover:bg-navy-700${
                        isActive ? " bg-navy-700 text-white font-semibold border-l-2 border-white" : ""
                      }`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <i class={`ph ${child.icon} text-body-sm`} aria-hidden="true" />
                      {child.label}
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
      <div class="border-t border-navy-700 px-4 py-2 text-body-sm text-navy-300 shrink-0">v0.2.0</div>
    </aside>
  );
};

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
          <a href="/profile" role="menuitem" class="flex items-center gap-2 px-3 py-2 hover:bg-gray-100">
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
