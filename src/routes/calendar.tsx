import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Panel, Badge } from "../components/ui";

export const calendarRoutes = new Hono<AppEnv>();

calendarRoutes.use("*", requireAuth);

// GET /calendar — calendar view with hearings and deadlines
calendarRoutes.get("/", async (c) => {
  const user = c.get("user");
  const today = new Date();
  const year = parseInt(c.req.query("year") ?? String(today.getFullYear()), 10);
  const month = parseInt(c.req.query("month") ?? String(today.getMonth() + 1), 10);

  // Calculate month range
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  // Fetch hearings and deadlines for the month
  const [hearingsRes, deadlinesRes] = await Promise.all([
    supabase
      .from("hearings")
      .select("id, title, hearing_date, cases(title)")
      .eq("tenant_id", user.tenantId)
      .gte("hearing_date", start.toISOString())
      .lte("hearing_date", end.toISOString())
      .order("hearing_date", { ascending: true }),
    supabase
      .from("deadlines")
      .select("id, title, due_date, priority, cases(title)")
      .eq("tenant_id", user.tenantId)
      .gte("due_date", start.toISOString())
      .lte("due_date", end.toISOString())
      .order("due_date", { ascending: true }),
  ]);

  // Build events map: date string -> events[]
  const eventsByDay = new Map<string, { type: "hearing" | "deadline"; id: string; title: string; caseTitle?: string; priority?: number }[]>();

  for (const h of hearingsRes.data ?? []) {
    const dateStr = new Date(h.hearing_date).toISOString().split("T")[0] ?? "";
    const caseTitle = (h.cases as unknown as { title: string } | null)?.title;
    if (!eventsByDay.has(dateStr)) eventsByDay.set(dateStr, []);
    eventsByDay.get(dateStr)!.push({ type: "hearing", id: h.id, title: h.title, caseTitle });
  }

  for (const d of deadlinesRes.data ?? []) {
    const dateStr = new Date(d.due_date).toISOString().split("T")[0] ?? "";
    const caseTitle = (d.cases as unknown as { title: string } | null)?.title;
    if (!eventsByDay.has(dateStr)) eventsByDay.set(dateStr, []);
    eventsByDay.get(dateStr)!.push({ type: "deadline", id: d.id, title: d.title, caseTitle, priority: d.priority });
  }

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startWeekday = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = lastDay.getDate();

  const monthNames = [
    "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  // Build cells: empty cells before the 1st, then days 1..N
  const cells: { day: number | null; dateStr: string | null; isToday: boolean; events: { type: "hearing" | "deadline"; id: string; title: string; caseTitle?: string; priority?: number }[] }[] = [];

  for (let i = 0; i < startWeekday; i++) {
    cells.push({ day: null, dateStr: null, isToday: false, events: [] });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dateStr = date.toISOString().split("T")[0] ?? "";
    const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
    cells.push({
      day: d,
      dateStr,
      isToday,
      events: eventsByDay.get(dateStr) ?? [],
    });
  }

  // Navigation
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

  return renderPage(
    c,
    { title: "Calendario", active: "calendar" },
    <>
      <PageHeader title="Calendario" icon="ph-calendar-blank" />

      <div class="flex items-center justify-between mb-6">
        <a href={`/calendar?year=${prevYear}&month=${prevMonth}`} class="btn btn-secondary inline-flex items-center gap-1">
          <i class="ph ph-caret-left" aria-hidden="true"></i>{monthNames[prevMonth - 1]}
        </a>
        <h2 class="text-h2 font-bold text-gray-800">{monthNames[month - 1]} {year}</h2>
        <a href={`/calendar?year=${nextYear}&month=${nextMonth}`} class="btn btn-secondary inline-flex items-center gap-1">
          {monthNames[nextMonth - 1]}<i class="ph ph-caret-right" aria-hidden="true"></i>
        </a>
      </div>

      <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {/* Weekday headers */}
        <div class="grid grid-cols-7 border-b border-gray-100">
          {weekdays.map((w) => (
            <div key={w} class="px-2 py-3 text-center text-body-xs font-semibold text-gray-400 uppercase tracking-wide">{w}</div>
          ))}
        </div>
        {/* Calendar grid */}
        <div class="grid grid-cols-7">
          {cells.map((cell, i) => (
            <div
              key={i}
              class={`min-h-28 border-b border-r border-gray-50 p-1.5 ${cell.day === null ? "bg-gray-50/50" : ""} ${cell.isToday ? "bg-[#e6efff]" : ""}`}
            >
              {cell.day !== null ? (
                <>
                  <div class={`text-body-xs font-medium mb-1 ${cell.isToday ? "text-[#0568ff]" : "text-gray-500"}`}>
                    {cell.day}
                  </div>
                  <div class="flex flex-col gap-0.5">
                    {cell.events.map((e) => (
                      <a
                        key={e.id}
                        href={e.type === "hearing" ? `/hearings/${e.id}` : `/deadlines/${e.id}`}
                        class={`text-body-xs px-1.5 py-0.5 rounded truncate block ${e.type === "hearing" ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : "bg-red-50 text-red-700 hover:bg-red-100"}`}
                        title={e.title}
                      >
                        <i class={`ph ${e.type === "hearing" ? "ph-gavel" : "ph-calendar"} text-body-xs mr-0.5`} aria-hidden="true"></i>
                        {e.title}
                      </a>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div class="flex items-center gap-4 mt-4 text-body-sm text-gray-600">
        <span class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded bg-blue-100 border border-blue-300"></span>Audiencias
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded bg-red-100 border border-red-300"></span>Prazos
        </span>
      </div>

      {/* Upcoming events summary */}
      <div class="grid grid-cols-2 gap-4 mt-6">
        <Panel title="Proximas audiencias" icon="ph-gavel">
          {(hearingsRes.data ?? []).length === 0 ? (
            <p class="text-body-sm text-gray-400 py-4 text-center">Nenhuma audiencia neste mes.</p>
          ) : (
            <ul class="flex flex-col gap-2">
              {(hearingsRes.data ?? []).slice(0, 5).map((h) => {
                const caseTitle = (h.cases as unknown as { title: string } | null)?.title;
                return (
                  <li key={h.id} class="flex items-center justify-between p-2 border border-gray-50 rounded-lg">
                    <div>
                      <a href={`/hearings/${h.id}`} class="text-body-sm font-medium text-gray-800 hover:text-[#0568ff]">{h.title}</a>
                      {caseTitle ? <div class="text-body-xs text-gray-500">{caseTitle}</div> : null}
                    </div>
                    <span class="text-body-xs text-gray-500">{new Date(h.hearing_date).toLocaleDateString("pt-BR")}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel title="Proximos prazos" icon="ph-calendar">
          {(deadlinesRes.data ?? []).length === 0 ? (
            <p class="text-body-sm text-gray-400 py-4 text-center">Nenhum prazo neste mes.</p>
          ) : (
            <ul class="flex flex-col gap-2">
              {(deadlinesRes.data ?? []).slice(0, 5).map((d) => {
                const caseTitle = (d.cases as unknown as { title: string } | null)?.title;
                const color = d.priority >= 3 ? "red" : d.priority === 2 ? "yellow" : "gray";
                return (
                  <li key={d.id} class="flex items-center justify-between p-2 border border-gray-50 rounded-lg">
                    <div>
                      <a href={`/deadlines/${d.id}`} class="text-body-sm font-medium text-gray-800 hover:text-[#0568ff]">{d.title}</a>
                      {caseTitle ? <div class="text-body-xs text-gray-500">{caseTitle}</div> : null}
                    </div>
                    <div class="flex items-center gap-2">
                      <Badge color={color as "red" | "yellow" | "gray"}>P{d.priority}</Badge>
                      <span class="text-body-xs text-gray-500">{new Date(d.due_date).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>,
  );
});
