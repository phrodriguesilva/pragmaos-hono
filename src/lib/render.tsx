import type { Context } from "hono";
import type { FC, PropsWithChildren } from "hono/jsx";
import { Layout, type BaseData } from "../layouts/base";
import { getSessionUser, type SessionUser } from "./session";
import { getFlash, type FlashType } from "./flash";

// Flash message component — reads from both cookie-based flash (setFlash)
// and URL query params (?success=... or ?error=...).
// Renders a toast notification that auto-dismisses after 4 seconds.
const FlashMessages: FC<{ flash: { type: FlashType; message: string } | null }> = ({ flash }) => {
  // Build initial state from cookie flash + URL params.
  const initCode = `
    (() => {
      const params = new URLSearchParams(window.location.search);
      const success = params.get('success');
      const error = params.get('error');
      const warning = params.get('warning');
      const info = params.get('info');
      ${flash ? `return { show: true, type: '${flash.type}', msg: ${JSON.stringify(flash.message)} };` : ""}
      if (success) return { show: true, type: 'success', msg: decodeURIComponent(success) };
      if (error) return { show: true, type: 'error', msg: decodeURIComponent(error) };
      if (warning) return { show: true, type: 'warning', msg: decodeURIComponent(warning) };
      if (info) return { show: true, type: 'info', msg: decodeURIComponent(info) };
      return { show: false, type: '', msg: '' };
    })()
  `;

  return (
    <div
      id="flashContainer"
      class="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
      {...{ "x-data": `{ show: false, type: '', msg: '' }` }}
      {...{ "x-init": `Object.assign($data, ${initCode}); if (show) { setTimeout(() => show = false, 4000); }` }}
    >
      <div
        {...{ "x-show": "show" }}
        {...{ "x-transition:opacity": "" }}
        x-cloak
        class="rounded-xl shadow-lg p-4 flex items-center gap-3 border"
        {...{ ":class": "type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : type === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-blue-50 border-blue-200 text-blue-800'" }}
      >
        <i class="ph text-h4" aria-hidden="true" {...{ ":class": "type === 'success' ? 'ph-check-circle' : type === 'error' ? 'ph-warning-circle' : type === 'warning' ? 'ph-warning' : 'ph-info'" }}></i>
        <span class="text-body-sm font-medium" {...{ "x-text": "msg" }}></span>
        <button type="button" class="ml-auto text-gray-400 hover:text-gray-600" onclick="this.parentElement.style.display='none'">
          <i class="ph ph-x" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );
};

// Render a page inside the base Layout, resolving the session user from context.
// Use this in protected routes where requireAuth has already set the user.
export function renderPage(
  c: Context,
  data: Omit<BaseData, "userName" | "userRole" | "firmName">,
  children: PropsWithChildren["children"],
) {
  const user = c.get("user") as SessionUser;
  const flash = getFlash(c);
  return c.html(
    <Layout
      title={data.title}
      active={data.active}
      firmName={user?.firmName}
      userName={user?.fullName ?? ""}
      userRole={user?.role}
    >
      <FlashMessages flash={flash} />
      {children}
    </Layout>,
  );
}

// Helper to build a list of route modules with requireAuth applied.
export { getSessionUser };
