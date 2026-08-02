import type { FC, PropsWithChildren } from "hono/jsx";
import { Sidebar, Topbar, type ModuleKey } from "../components/icons";
import { appCss } from "../generated/css";

export type BaseData = {
  title: string;
  active: ModuleKey;
  firmName?: string;
  userName: string;
  userRole?: string;
};

export const Layout: FC<PropsWithChildren<BaseData>> = ({
  title,
  active,
  firmName,
  userName,
  userRole,
  children,
}) => (
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{title} - PragmaOS</title>
      <style dangerouslySetInnerHTML={{ __html: appCss }} />
      <link rel="stylesheet" href="/static/css/phosphor-regular.css" />
      <link rel="stylesheet" href="/static/css/phosphor-bold.css" />
      <script src="https://unpkg.com/alpinejs@3.14.8" defer />
    </head>
    <body class="bg-gray-50 text-body font-sans antialiased" {...{ "x-data": "{ sidebarOpen: false }" }}>
      {/* Mobile sidebar overlay */}
      <div
        {...{ "x-show": "sidebarOpen", "@click": "sidebarOpen = false" }}
        x-cloak
        class="fixed inset-0 bg-black/50 z-40 lg:hidden"
      ></div>
      {/* Sidebar — fixed on mobile, static on desktop */}
      <div
        {...{ ":class": "sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'", "@keydown.escape.window": "sidebarOpen = false" }}
        class="fixed lg:static inset-y-0 left-0 z-50 lg:z-auto transition-transform duration-200"
      >
        <Sidebar active={active} />
      </div>
      <div class="lg:ml-sidebar flex flex-col min-h-screen">
        {/* Mobile hamburger button */}
        <button
          {...{ "@click": "sidebarOpen = true" }}
          class="lg:hidden fixed top-3 left-3 z-30 bg-white p-2 rounded-lg shadow-md border border-gray-100"
          aria-label="Abrir menu"
        >
          <i class="ph ph-list text-h4 text-gray-700" aria-hidden="true"></i>
        </button>
        <Topbar firmName={firmName} userName={userName} userRole={userRole} />
        <main class="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </body>
  </html>
);

// Bare layout for auth pages (login) -- no sidebar/topbar.
export const AuthLayout: FC<PropsWithChildren<{ title: string }>> = ({ title, children }) => (
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{title} - PragmaOS</title>
      <style dangerouslySetInnerHTML={{ __html: appCss }} />
      <link rel="stylesheet" href="/static/css/phosphor-regular.css" />
      <link rel="stylesheet" href="/static/css/phosphor-bold.css" />
      <script src="https://unpkg.com/alpinejs@3.14.8" defer />
    </head>
    <body class="text-body font-sans min-h-screen flex items-center justify-center p-4 antialiased" style="background: linear-gradient(135deg, #1f1d1a 0%, #2b2925 50%, #36332e 100%);">
      <div class="w-full max-w-sm bg-white p-8 rounded-2xl shadow-2xl">
        <div class="flex flex-col items-center mb-6">
          <img src="/static/pragmaos-logo-dark.png" alt="PragmaOS" class="h-12 w-auto mb-1" />
        </div>
        {children}
      </div>
    </body>
  </html>
);
