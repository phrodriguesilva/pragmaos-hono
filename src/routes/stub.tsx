import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { PageHeader, Panel } from "../components/ui";

// Generic stub route for modules not yet implemented.
export function stubRoute(
  mountPath: string,
  title: string,
  icon: string,
  description: string,
  features: string[],
): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  router.use("*", requireAuth);

  router.get("/", (c) => {
    return renderPage(
      c,
      { title, active: mountPath.replace("/", "") },
      <>
        <PageHeader title={title} icon={icon} />
        <Panel>
          <div class="flex items-start gap-3 mb-4">
            <i class={`ph-bold ${icon} text-h1 text-[#0568ff]`} aria-hidden="true" />
            <div>
              <p class="text-body text-gray-700 mb-2">{description}</p>
              <p class="text-body-sm text-gray-500">
                Este modulo esta em desenvolvimento. Funcionalidades planejadas:
              </p>
            </div>
          </div>
          <ul class="flex flex-col gap-1 text-body-sm text-gray-600">
            {features.map((f) => (
              <li class="flex items-center gap-2">
                <i class="ph ph-circle text-body-sm text-gray-400" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
        </Panel>
      </>,
    );
  });

  return router;
}
