import type { Context } from "hono";
import type { FC, PropsWithChildren } from "hono/jsx";
import { Layout, type BaseData } from "../layouts/base";
import { getSessionUser, type SessionUser } from "./session";
import { getFlash, type FlashType } from "./flash";

// CSP nonce — module-level variable set per-request by the security headers
// middleware in app.ts. Works for single-threaded Node.js request handling.
let currentNonce = "";
export function setNonce(nonce: string) { currentNonce = nonce; }
export function getNonce() { return currentNonce; }

// Flash message component — reads from both cookie-based flash (setFlash)
// and URL query params (?success=... or ?error=...).
// Renders a toast notification that auto-dismisses after 4 seconds.
//
// CSP note: The init logic (URLSearchParams, setTimeout, Object.assign) cannot
// be used in x-init with the CSP build (no global function calls or arrow
// functions in directives). Instead, we register an Alpine.data component via
// a nonce'd script and reference it by name in x-data.
const FlashMessages: FC<{ flash: { type: FlashType; message: string } | null }> = ({ flash }) => {
  // Serialize flash data for the data attribute (read client-side by the component).
  const flashData = flash ? JSON.stringify({ show: true, type: flash.type, msg: flash.message }) : "";

  return (
    <>
      <script nonce={getNonce()} dangerouslySetInnerHTML={{ __html: `
        document.addEventListener('alpine:init', () => {
          Alpine.data('flashMessages', () => ({
            show: false,
            type: '',
            msg: '',
            init() {
              var el = this.$el;
              var initial = el.getAttribute('data-flash');
              if (initial) {
                try {
                  var d = JSON.parse(initial);
                  this.show = d.show || false;
                  this.type = d.type || '';
                  this.msg = d.msg || '';
                } catch(e) {}
              } else {
                var params = new URLSearchParams(window.location.search);
                var success = params.get('success');
                var error = params.get('error');
                var warning = params.get('warning');
                var info = params.get('info');
                if (success) { this.show = true; this.type = 'success'; this.msg = decodeURIComponent(success); }
                else if (error) { this.show = true; this.type = 'error'; this.msg = decodeURIComponent(error); }
                else if (warning) { this.show = true; this.type = 'warning'; this.msg = decodeURIComponent(warning); }
                else if (info) { this.show = true; this.type = 'info'; this.msg = decodeURIComponent(info); }
              }
              if (this.show) {
                var self = this;
                setTimeout(function() { self.show = false; }, 4000);
              }
            },
            dismiss() { this.show = false; }
          }));
        }, { once: true });
      `}} />
      <div
        id="flashContainer"
        class="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
        {...{ "x-data": "flashMessages" }}
        {...(flashData ? { "data-flash": flashData } : {})}
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
          <button type="button" class="ml-auto text-gray-400 hover:text-gray-600" {...{ "@click": "dismiss" }}>
            <i class="ph ph-x" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </>
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
