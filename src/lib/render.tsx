import type { Context } from "hono";
import type { FC, PropsWithChildren } from "hono/jsx";
import { Layout, type BaseData } from "../layouts/base";
import { getSessionUser, type SessionUser } from "./session";

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
      {children}
    </Layout>,
  );
}

// Helper to build a list of route modules with requireAuth applied.
export { getSessionUser };
