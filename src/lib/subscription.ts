// Subscription enforcement — checks trial expiration and subscription status.
// Used by middleware to block access to the app when trial has expired
// or subscription is past_due/canceled/suspended.

import { supabase } from "./supabase";
import { log } from "./logger";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "suspended" | "none";

export interface SubscriptionState {
  status: SubscriptionStatus;
  plan: string;
  trialEndsAt: string | null;
  daysLeft: number;          // days left in trial (0 if expired or not trialing)
  currentPeriodEnd: string | null;
  onboardingCompleted: boolean;
}

// Get the subscription state for a tenant.
export async function getSubscriptionState(tenantId: string): Promise<SubscriptionState> {
  const { data: tenant } = await supabase
    .from("tenants")
    .select("subscription_status, subscription_plan, trial_ends_at, current_period_end, onboarding_completed")
    .eq("id", tenantId)
    .single();

  if (!tenant) {
    return { status: "none", plan: "trial", trialEndsAt: null, daysLeft: 0, currentPeriodEnd: null, onboardingCompleted: false };
  }

  const status = tenant.subscription_status as SubscriptionStatus;
  const trialEndsAt = tenant.trial_ends_at;
  const now = Date.now();

  let daysLeft = 0;
  if (status === "trialing" && trialEndsAt) {
    const diff = new Date(trialEndsAt).getTime() - now;
    daysLeft = Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }

  return {
    status,
    plan: tenant.subscription_plan ?? "trial",
    trialEndsAt,
    daysLeft,
    currentPeriodEnd: tenant.current_period_end,
    onboardingCompleted: tenant.onboarding_completed ?? false,
  };
}

// Check if access should be blocked (trial expired or subscription inactive).
// Returns the reason if blocked, null if access is allowed.
export function shouldBlockAccess(state: SubscriptionState): string | null {
  // Active subscription or active trial = allowed
  if (state.status === "active") return null;
  if (state.status === "trialing" && state.daysLeft > 0) return null;

  if (state.status === "trialing" && state.daysLeft <= 0) {
    return "trial_expired";
  }
  if (state.status === "past_due") return "past_due";
  if (state.status === "suspended") return "suspended";
  if (state.status === "canceled") return "canceled";
  if (state.status === "none") return "no_subscription";

  return null;
}

// Auto-expire trials that have passed their end date (housekeeping).
// Called on each protected request; updates the tenant status if needed.
export async function autoExpireTrials(tenantId: string, state: SubscriptionState): Promise<SubscriptionState> {
  if (state.status === "trialing" && state.daysLeft <= 0) {
    log.info("Trial expired — updating tenant status", { tenantId });
    await supabase
      .from("tenants")
      .update({ subscription_status: "suspended", status: "suspended" })
      .eq("id", tenantId);
    return { ...state, status: "suspended" };
  }
  return state;
}
