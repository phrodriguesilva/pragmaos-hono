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
      <script src="https://unpkg.com/htmx.org@2.0.4" defer />
      <script src="https://unpkg.com/alpinejs@3.14.8" defer />
    </head>
    <body class="bg-gray-50 text-body font-sans">
      <Sidebar active={active} />
      <div class="ml-sidebar flex flex-col min-h-screen">
        <Topbar firmName={firmName} userName={userName} userRole={userRole} />
        <main class="flex-1 p-4">{children}</main>
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
    </head>
    <body class="bg-navy-800 text-body font-sans min-h-screen flex items-center justify-center">
      <div class="w-full max-w-sm border border-navy-700 bg-white p-8">{children}</div>
    </body>
  </html>
);
