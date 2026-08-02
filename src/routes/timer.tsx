import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { supabase } from "../lib/supabase";

export const timerRoutes = new Hono<AppEnv>();

timerRoutes.use("*", requireAuth);

// GET /timer/api/status — get current running timer
timerRoutes.get("/api/status", async (c) => {
  const user = c.get("user");

  const { data: entry } = await supabase
    .from("time_entries")
    .select("id, description, start_time, case_id, billable")
    .eq("tenant_id", user.tenantId)
    .eq("user_id", user.id)
    .is("end_time", null)
    .is("deleted_at", null)
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!entry) {
    return c.json({ running: false });
  }

  const startTime = new Date(entry.start_time);
  const elapsedSeconds = Math.floor((Date.now() - startTime.getTime()) / 1000);

  return c.json({
    running: true,
    entry: {
      id: entry.id,
      description: entry.description,
      case_id: entry.case_id,
      billable: entry.billable,
      start_time: entry.start_time,
      elapsed_seconds: elapsedSeconds,
    },
  });
});

// POST /timer/api/start — start a new timer
timerRoutes.post("/api/start", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));

  // Stop any running timer first
  const { data: running } = await supabase
    .from("time_entries")
    .select("id, start_time")
    .eq("tenant_id", user.tenantId)
    .eq("user_id", user.id)
    .is("end_time", null)
    .is("deleted_at", null);

  for (const r of running ?? []) {
    const startTime = new Date(r.start_time);
    const endTime = new Date();
    const durationMinutes = Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 60000));
    await supabase
      .from("time_entries")
      .update({ end_time: endTime.toISOString(), duration_minutes: durationMinutes })
      .eq("id", r.id);
  }

  // Create new timer entry
  const { data: entry, error } = await supabase
    .from("time_entries")
    .insert({
      tenant_id: user.tenantId,
      user_id: user.id,
      description: body.description ?? "Trabalhando...",
      case_id: body.case_id ?? null,
      billable: body.billable ?? false,
      start_time: new Date().toISOString(),
    })
    .select("id, description, start_time, case_id, billable")
    .single();

  if (error) {
    return c.json({ error: error.message }, 400);
  }

  return c.json({ running: true, entry });
});

// POST /timer/api/stop — stop the running timer
timerRoutes.post("/api/stop", async (c) => {
  const user = c.get("user");

  const { data: entry } = await supabase
    .from("time_entries")
    .select("id, start_time, description")
    .eq("tenant_id", user.tenantId)
    .eq("user_id", user.id)
    .is("end_time", null)
    .is("deleted_at", null)
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!entry) {
    return c.json({ error: "No running timer" }, 400);
  }

  const startTime = new Date(entry.start_time);
  const endTime = new Date();
  const durationMinutes = Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 60000));

  await supabase
    .from("time_entries")
    .update({
      end_time: endTime.toISOString(),
      duration_minutes: durationMinutes,
    })
    .eq("id", entry.id);

  return c.json({
    running: false,
    stopped: {
      id: entry.id,
      description: entry.description,
      duration_minutes: durationMinutes,
    },
  });
});
