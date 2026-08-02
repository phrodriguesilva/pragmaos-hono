// Internal jurimetry — statistical analysis of the firm's own case data.
// Calculates success rates, average duration, outcome distribution, etc.
//
// PragmaOS 2.

import { supabase } from "./supabase";
import { log } from "./logger";

export interface JurimetryFilters {
  area?: string;      // area of law (e.g., "civel", "trabalhista")
  court?: string;     // court/tribunal
  lawyerId?: string;  // filter by responsible lawyer
  startDate?: string; // ISO date
  endDate?: string;   // ISO date
}

export interface JurimetryReport {
  totalCases: number;
  activeCases: number;
  closedCases: number;
  successRate: number;        // % of closed cases with favorable outcome
  avgDurationDays: number;    // average duration of closed cases
  medianDurationDays: number;
  outcomeDistribution: { outcome: string; count: number; percentage: number }[];
  areaDistribution: { area: string; count: number; successRate: number }[];
  monthlyTrend: { month: string; filed: number; closed: number }[];
  topLawyers: { lawyerId: string; lawyerName: string; cases: number; successRate: number }[];
  valueAnalysis: {
    totalClaimed: number;     // total value claimed (cents)
    totalRecovered: number;   // total value recovered (cents)
    recoveryRate: number;     // %
  };
}

// Calculate jurimetry report for a tenant.
export async function calculateJurimetry(
  tenantId: string,
  filters: JurimetryFilters = {},
): Promise<JurimetryReport> {
  // Build base query.
  let query = supabase
    .from("cases")
    .select(`
      id, title, status, area, court, outcome, filed_at, closed_at,
      estimated_value_cents, recovered_value_cents,
      responsible_lawyer_id,
      profiles!cases_responsible_lawyer_id_fkey(full_name)
    `)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);

  if (filters.area) query = query.eq("area", filters.area);
  if (filters.court) query = query.eq("court", filters.court);
  if (filters.lawyerId) query = query.eq("responsible_lawyer_id", filters.lawyerId);
  if (filters.startDate) query = query.gte("filed_at", filters.startDate);
  if (filters.endDate) query = query.lte("filed_at", filters.endDate);

  const { data: cases, error } = await query;

  if (error) {
    log.error("Failed to fetch cases for jurimetry", { tenantId, error: error.message });
    return emptyReport();
  }

  if (!cases || cases.length === 0) {
    return emptyReport();
  }

  const totalCases = cases.length;
  const activeCases = cases.filter((c) => c.status === "active" || c.status === "pending").length;
  const closedCases = cases.filter((c) => c.status === "closed" || c.status === "archived" || c.closed_at).length;

  // Outcome distribution.
  const outcomeMap = new Map<string, number>();
  for (const c of cases) {
    if (c.closed_at || c.status === "closed" || c.status === "archived") {
      const outcome = c.outcome ?? "indefinido";
      outcomeMap.set(outcome, (outcomeMap.get(outcome) ?? 0) + 1);
    }
  }

  const favorableOutcomes = ["procedente", "procedente_em_parte", "acordo", "ganhou"];
  const favorableCount = [...outcomeMap.entries()]
    .filter(([outcome]) => favorableOutcomes.includes(outcome.toLowerCase()))
    .reduce((sum, [, count]) => sum + count, 0);

  const successRate = closedCases > 0 ? (favorableCount / closedCases) * 100 : 0;

  const outcomeDistribution = [...outcomeMap.entries()]
    .map(([outcome, count]) => ({
      outcome,
      count,
      percentage: closedCases > 0 ? (count / closedCases) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Duration analysis (for closed cases with filed_at and closed_at).
  const durations: number[] = [];
  for (const c of cases) {
    if (c.filed_at && c.closed_at) {
      const filed = new Date(c.filed_at);
      const closed = new Date(c.closed_at);
      const days = Math.round((closed.getTime() - filed.getTime()) / (1000 * 60 * 60 * 24));
      if (days >= 0) durations.push(days);
    }
  }

  const avgDurationDays = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;
  const sortedDurations = [...durations].sort((a, b) => a - b);
  const medianDurationDays = sortedDurations.length > 0
    ? sortedDurations[Math.floor(sortedDurations.length / 2)]!
    : 0;

  // Area distribution.
  const areaMap = new Map<string, { total: number; favorable: number }>();
  for (const c of cases) {
    const area = c.area ?? "outros";
    const entry = areaMap.get(area) ?? { total: 0, favorable: 0 };
    entry.total++;
    if ((c.closed_at || c.status === "closed") && favorableOutcomes.includes((c.outcome ?? "").toLowerCase())) {
      entry.favorable++;
    }
    areaMap.set(area, entry);
  }

  const areaDistribution = [...areaMap.entries()]
    .map(([area, { total, favorable }]) => ({
      area,
      count: total,
      successRate: total > 0 ? (favorable / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Monthly trend (last 12 months).
  const monthlyMap = new Map<string, { filed: number; closed: number }>();
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, { filed: 0, closed: 0 });
  }

  for (const c of cases) {
    if (c.filed_at) {
      const filed = new Date(c.filed_at);
      const key = `${filed.getFullYear()}-${String(filed.getMonth() + 1).padStart(2, "0")}`;
      const entry = monthlyMap.get(key);
      if (entry) entry.filed++;
    }
    if (c.closed_at) {
      const closed = new Date(c.closed_at);
      const key = `${closed.getFullYear()}-${String(closed.getMonth() + 1).padStart(2, "0")}`;
      const entry = monthlyMap.get(key);
      if (entry) entry.closed++;
    }
  }

  const monthlyTrend = [...monthlyMap.entries()].map(([month, data]) => ({
    month,
    filed: data.filed,
    closed: data.closed,
  }));

  // Top lawyers by success rate.
  const lawyerMap = new Map<string, { name: string; total: number; favorable: number }>();
  for (const c of cases) {
    if (!c.responsible_lawyer_id) continue;
    const profile = c.profiles as unknown as { full_name: string } | null;
    const name = profile?.full_name ?? "—";
    const entry = lawyerMap.get(c.responsible_lawyer_id) ?? { name, total: 0, favorable: 0 };
    entry.total++;
    if ((c.closed_at || c.status === "closed") && favorableOutcomes.includes((c.outcome ?? "").toLowerCase())) {
      entry.favorable++;
    }
    lawyerMap.set(c.responsible_lawyer_id, entry);
  }

  const topLawyers = [...lawyerMap.entries()]
    .map(([lawyerId, { name, total, favorable }]) => ({
      lawyerId,
      lawyerName: name,
      cases: total,
      successRate: total > 0 ? (favorable / total) * 100 : 0,
    }))
    .filter((l) => l.cases >= 2) // only lawyers with at least 2 cases
    .sort((a, b) => b.successRate - a.successRate)
    .slice(0, 10);

  // Value analysis.
  const totalClaimed = cases.reduce((sum, c) => sum + (c.estimated_value_cents ?? 0), 0);
  const totalRecovered = cases.reduce((sum, c) => sum + (c.recovered_value_cents ?? 0), 0);
  const recoveryRate = totalClaimed > 0 ? (totalRecovered / totalClaimed) * 100 : 0;

  return {
    totalCases,
    activeCases,
    closedCases,
    successRate,
    avgDurationDays,
    medianDurationDays,
    outcomeDistribution,
    areaDistribution,
    monthlyTrend,
    topLawyers,
    valueAnalysis: {
      totalClaimed,
      totalRecovered,
      recoveryRate,
    },
  };
}

function emptyReport(): JurimetryReport {
  return {
    totalCases: 0,
    activeCases: 0,
    closedCases: 0,
    successRate: 0,
    avgDurationDays: 0,
    medianDurationDays: 0,
    outcomeDistribution: [],
    areaDistribution: [],
    monthlyTrend: [],
    topLawyers: [],
    valueAnalysis: {
      totalClaimed: 0,
      totalRecovered: 0,
      recoveryRate: 0,
    },
  };
}
