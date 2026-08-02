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
      { key: "documents", label: "Documentos", href: "/documents", icon: "ph-file-text" },
      { key: "templates", label: "Modelos", href: "/templates", icon: "ph-files" },
      { key: "signatures", label: "Assinaturas", href: "/signatures", icon: "ph-pen-nib" },
      { key: "diario-oficial", label: "Diario Oficial", href: "/diario-oficial", icon: "ph-newspaper" },
      { key: "intimacoes", label: "Intimacoes", href: "/intimacoes", icon: "ph-envelope-open" },
      { key: "prazos", label: "Calc. de Prazos", href: "/prazos", icon: "ph-calendar-x" },
      { key: "calendar", label: "Calendario", href: "/calendar", icon: "ph-calendar-blank" },
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
      { key: "notifications", label: "Notificacoes", href: "/notifications", icon: "ph-bell" },
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
      { key: "timesheet", label: "Timesheet", href: "/timesheet", icon: "ph-timer" },
      { key: "finance-reports", label: "Relatorios", href: "/finance-reports", icon: "ph-chart-pie" },
      { key: "trust-accounts", label: "Contas de Clientes", href: "/trust-accounts", icon: "ph-piggy-bank" },
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
  { key: "portal", label: "Portal do Cliente", href: "/portal/staff", icon: "ph-globe" },
  {
    key: "admin",
    label: "Administracao",
    icon: "ph-gear",
    children: [
      { key: "users", label: "Usuarios", href: "/users", icon: "ph-user-circle-gear" },
      { key: "teams", label: "Equipes", href: "/teams", icon: "ph-users-four" },
      { key: "workflows", label: "Workflows", href: "/workflows", icon: "ph-gear-six" },
      { key: "permissions", label: "Permissoes", href: "/permissions", icon: "ph-key" },
      { key: "integrations", label: "Integracoes", href: "/integrations", icon: "ph-plugs-connected" },
      { key: "api-keys", label: "API e Webhooks", href: "/api-keys", icon: "ph-code" },
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
    <aside class="h-full w-sidebar flex flex-col overflow-y-auto" style="background: linear-gradient(180deg, #2b2925 0%, #1f1d1a 100%);">
      <div class="h-16 flex items-center gap-2.5 px-5 shrink-0 border-b border-white/5">
        <div class="w-9 h-9 rounded-lg bg-terracota-500 flex items-center justify-center shrink-0">
          <i class="ph-bold ph-scales text-white text-h3" aria-hidden="true" />
        </div>
        <span class="text-h3 font-semibold text-white tracking-tight">PragmaOS</span>
      </div>
      <nav class="flex-1 flex flex-col py-3 gap-0.5 px-3">
        {MENU.map((item) => {
          if (!isGroup(item)) {
            // Top-level link (Dashboard, BI, Portal)
            const isActive = active === item.key;
            return (
              <a
                href={item.href}
                class={`flex items-center gap-3 px-3 py-2.5 text-body-sm rounded-lg transition-all${
                  isActive ? " bg-terracota-500/15 text-terracota-300 font-semibold" : " text-gray-400 hover:bg-white/5 hover:text-white"
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
                class={`flex items-center justify-between px-3 py-2.5 text-body-sm rounded-lg transition-all w-full${
                  isExpanded ? " text-white" : " text-gray-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span class="flex items-center gap-3">
                  <i class={`ph ${item.icon} text-body`} aria-hidden="true" />
                  {item.label}
                </span>
                <i {...{ ":class": "open ? 'ph ph-caret-up' : 'ph ph-caret-down'" }} class="ph ph-caret-down text-body-sm opacity-60" aria-hidden="true" />
              </button>
              <div {...{ "x-show": "open", "x-transition": "" }} class="flex flex-col mt-1 gap-0.5 pl-2">
                {item.children.map((child) => {
                  const isActive = active === child.key;
                  return (
                    <a
                      href={child.href}
                      class={`flex items-center gap-3 px-3 py-2 text-body-sm rounded-lg transition-all${
                        isActive ? " bg-terracota-500/15 text-terracota-300 font-semibold" : " text-gray-500 hover:bg-white/5 hover:text-white"
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
      <div class="px-5 py-4 text-body-xs text-gray-600 shrink-0 border-t border-white/5">PragmaOS v0.2.0</div>
    </aside>
  );
};

export const Topbar: FC<{ firmName?: string; userName: string; userRole?: string }> = ({
  firmName,
  userName,
  userRole,
}) => (
  <header class="w-full bg-white/80 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-6 py-3.5 sticky top-0 z-30">
    <span class="text-h3 text-gray-800 font-semibold">{firmName ?? "PragmaOS"}</span>
    <div class="flex items-center gap-5">
      {/* Global search (Cmd+K) */}
      <div {...{ "x-data": "{ open: false, q: '', results: [], async search() { if (this.q.length < 2) { this.results = []; return; } try { const r = await fetch('/search/api?q=' + encodeURIComponent(this.q)); const d = await r.json(); this.results = d.results ?? []; } catch(e) {} } }" }}>
        <button
          {...{ "@click": "open = true", "@keydown.cmd.k.prevent": "open = true", "@keydown.ctrl+k.prevent": "open = true" }}
          class="flex items-center gap-2 bg-gray-50 text-body-sm text-gray-500 px-3 py-2 rounded-lg hover:bg-gray-100 border border-transparent hover:border-gray-200 w-64 justify-between"
          aria-label="Buscar (Cmd+K)"
        >
          <span class="flex items-center gap-2">
            <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
            <span class="hidden sm:inline">Buscar processos, clientes...</span>
          </span>
          <kbd class="hidden sm:inline text-body-xs text-gray-400 bg-white border border-gray-200 rounded px-1.5 py-0.5">Cmd+K</kbd>
        </button>
        {/* Search modal */}
        <div
          {...{ "x-show": "open", "@click.outside": "open = false", "@keydown.escape.window": "open = false" }}
          x-cloak
          class="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/30"
        >
          <div class="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden" {...{ "@click.stop": "" }}>
            <div class="flex items-center gap-3 p-4 border-b border-gray-100">
              <i class="ph ph-magnifying-glass text-gray-400" aria-hidden="true"></i>
              <input
                type="text"
                {...{ "x-model": "q", "@input.debounce.150ms": "search()", "x-ref": "searchInput", "@keydown.enter.prevent": "results[0] && (window.location = results[0].link)" }}
                placeholder="Buscar processos, clientes, prazos..."
                class="flex-1 text-body outline-none placeholder:text-gray-400"
                aria-label="Campo de busca"
              />
              <kbd class="text-body-xs text-gray-400 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">ESC</kbd>
            </div>
            <div class="max-h-96 overflow-y-auto">
              <template {...{ "x-if": "q.length < 2" }}>
                <div class="p-8 text-center text-gray-400 text-body-sm">
                  Digite pelo menos 2 caracteres para buscar.
                </div>
              </template>
              <template {...{ "x-if": "q.length >= 2 && results.length === 0" }}>
                <div class="p-8 text-center text-gray-400 text-body-sm">
                  Nenhum resultado encontrado.
                </div>
              </template>
              <template {...{ "x-for": "(r, i) in results", ":key": "r.id" }}>
                <a {...{ ":href": "r.link" }} class="flex items-center gap-3 p-3 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                  <i {...{ ":class": "r.icon" }} class="ph text-h4 text-gray-400" aria-hidden="true"></i>
                  <div class="flex-1 min-w-0">
                    <div class="text-body-sm font-medium text-gray-800 truncate" {...{ "x-text": "r.title" }}></div>
                    <div class="text-body-xs text-gray-500 truncate" {...{ "x-text": "r.subtitle" }}></div>
                  </div>
                  <span class="text-body-xs text-gray-400 capitalize" {...{ "x-text": "r.type" }}></span>
                </a>
              </template>
            </div>
          </div>
        </div>
      </div>
      {/* Notifications bell with badge */}
      <div {...{ "x-data": "{ count: 0, open: false, async fetch() { try { const r = await fetch('/notifications/api/count'); const d = await r.json(); this.count = d.count ?? 0; } catch(e) {} }, init() { this.fetch(); setInterval(() => this.fetch(), 30000); } }" }} class="relative flex items-center">
        {/* Notifications bell */}
        <button
          {...{ "@click": "open = !open" }}
          aria-label="Notificacoes"
          class="relative p-2 rounded-lg hover:bg-gray-50 text-gray-500 hover:text-gray-700 flex items-center justify-center"
        >
          <i class="ph ph-bell text-h4" aria-hidden="true"></i>
          <span {...{ "x-show": "count > 0", "x-text": "count > 99 ? '99+' : count" }} x-cloak
            class="absolute -top-0.5 -right-0.5 bg-status-red text-white text-body-xs font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center"
          ></span>
        </button>
        <div
          {...{ "x-show": "open", "@click.outside": "open = false", "@keydown.escape.window": "open = false" }}
          role="menu"
          x-cloak
          class="absolute right-0 top-full mt-2 bg-white text-body-sm text-gray-800 min-w-64 rounded-xl border border-gray-100 shadow-xl py-2"
          style="animation: var(--animate-fade-in);"
        >
          <div class="px-4 py-2 border-b border-gray-100 font-semibold text-gray-700 flex items-center justify-between">
            <span>Notificacoes</span>
            <span {...{ "x-show": "count > 0", "x-text": "count + ' nao lida(s)'" }} x-cloak class="text-body-xs text-status-red font-normal"></span>
          </div>
          <div {...{ "x-show": "count === 0" }} x-cloak class="px-4 py-6 text-center text-gray-400">
            <i class="ph ph-bell-slash text-h3 block mb-1" aria-hidden="true"></i>
            <span class="text-body-xs">Tudo em dia!</span>
          </div>
          <a href="/notifications" role="menuitem" class="flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 border-t border-gray-50">
            <i class="ph ph-list-bullets text-gray-400" aria-hidden="true" />Ver todas
          </a>
        </div>
      </div>
      <div {...{ "x-data": "{ open: false }" }} class="relative">
        <button
          {...{ "@click": "open = !open" }}
          aria-label="Menu do usuario"
          aria-haspopup="menu"
          class="flex items-center gap-2 text-body-sm text-gray-700 hover:text-gray-900 font-medium rounded-lg px-2 py-1.5 hover:bg-gray-50"
        >
          <div class="w-8 h-8 rounded-full bg-gradient-to-br from-terracota-400 to-terracota-600 flex items-center justify-center text-white text-body-sm font-bold">
            {userName.charAt(0).toUpperCase()}
          </div>
          <span class="hidden sm:flex flex-col items-start leading-tight">
            <span>{userName}</span>
            {userRole ? <span class="text-body-xs text-gray-400 font-normal">{userRole}</span> : null}
          </span>
        </button>
        <div
          {...{ "x-show": "open", "@click.outside": "open = false", "@keydown.escape.window": "open = false" }}
          role="menu"
          class="absolute right-0 top-full mt-2 bg-white text-body-sm text-gray-800 min-w-40 rounded-xl border border-gray-100 shadow-xl py-1.5"
          style="animation: var(--animate-fade-in);"
        >
          <a href="/profile" role="menuitem" class="flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50">
            <i class="ph ph-user text-gray-400" aria-hidden="true" />Perfil
          </a>
          <a href="/logout" role="menuitem" class="flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 text-status-red">
            <i class="ph ph-sign-out" aria-hidden="true" />Sair
          </a>
        </div>
      </div>
    </div>
  </header>
);
