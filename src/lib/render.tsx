import type { Context } from "hono";
import type { FC, PropsWithChildren } from "hono/jsx";
import { Layout, type BaseData } from "../layouts/base";
import { getSessionUser, type SessionUser } from "./session";

// Flash message component — reads ?success= or ?error= from the URL query string
// and renders a toast notification that auto-dismisses after 4 seconds.
const FlashMessages: FC = () => {
  return (
    <div
      id="flashContainer"
      class="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
      {...{ "x-data": "{ show: false, type: '', msg: '' }" }}
      {...{ "x-init": `var params = new URLSearchParams(window.location.search); var success = params.get('success'); var error = params.get('error'); if (success) { show = true; type = 'success'; msg = decodeURIComponent(success); } else if (error) { show = true; type = 'error'; msg = decodeURIComponent(error); } if (show) { setTimeout(function() { show = false; }, 4000); }` }}
    >
      <div
        {...{ "x-show": "show" }}
        {...{ "x-transition:opacity": "" }}
        class="rounded-xl shadow-lg p-4 flex items-center gap-3 border bg-green-50 border-green-200 text-green-800"
        {...{ ":class": "type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'" }}
      >
        <i class="ph ph-check-circle text-h4" aria-hidden="true" {...{ ":class": "type === 'error' ? 'ph-warning-circle' : 'ph-check-circle'" }}></i>
        <span class="text-body-sm font-medium" {...{ "x-text": "msg" }}></span>
        <button type="button" class="ml-auto text-gray-400 hover:text-gray-600" onclick="this.parentElement.parentElement.style.display='none'">
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
  return c.html(
    <Layout
      title={data.title}
      active={data.active}
      firmName={user?.firmName}
      userName={user?.fullName ?? ""}
      userRole={user?.role}
    >
      <FlashMessages />
      {children}
    </Layout>,
  );
}

// Helper to build a list of route modules with requireAuth applied.
export { getSessionUser };
