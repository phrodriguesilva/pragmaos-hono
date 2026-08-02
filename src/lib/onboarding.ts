// Onboarding helpers — track wizard progress per tenant.
// After signup, the admin is redirected to /onboarding to complete:
// 1. Company data (CNPJ, address, OAB)
// 2. Law areas (what the firm practices)
// 3. Team (invite/add members)
// 4. Branding (logo, colors, tagline)
// 5. Done — redirect to dashboard.

import { supabase } from "./supabase";
import { log } from "./logger";

export const ONBOARDING_STEPS = ["company", "areas", "team", "branding", "done"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingState {
  completed: boolean;
  currentStep: OnboardingStep;
  completedSteps: string[];
}

// Get the onboarding state for a tenant.
export async function getOnboardingState(tenantId: string): Promise<OnboardingState> {
  const { data: tenant } = await supabase
    .from("tenants")
    .select("onboarding_completed, onboarding_step")
    .eq("id", tenantId)
    .single();

  if (!tenant) {
    return { completed: false, currentStep: "company", completedSteps: [] };
  }

  if (tenant.onboarding_completed) {
    return { completed: true, currentStep: "done", completedSteps: [...ONBOARDING_STEPS] };
  }

  const { data: steps } = await supabase
    .from("onboarding_steps")
    .select("step, completed")
    .eq("tenant_id", tenantId)
    .eq("completed", true);

  const completedSteps = (steps ?? []).map((s) => s.step);
  const stepIdx = Math.min(tenant.onboarding_step ?? 0, ONBOARDING_STEPS.length - 1);
  const currentStep = ONBOARDING_STEPS[stepIdx] ?? "company";

  return { completed: false, currentStep, completedSteps };
}

// Mark a step as completed and advance the wizard.
export async function completeStep(
  tenantId: string,
  step: OnboardingStep,
  data?: Record<string, unknown>,
): Promise<void> {
  const idx = ONBOARDING_STEPS.indexOf(step);
  if (idx === -1) return;

  // Upsert the step record.
  await supabase
    .from("onboarding_steps")
    .upsert(
      { tenant_id: tenantId, step, completed: true, data: data ?? null, completed_at: new Date().toISOString() },
      { onConflict: "tenant_id,step" },
    );

  const nextStep = idx + 1;
  const isDone = nextStep >= ONBOARDING_STEPS.length;

  if (isDone) {
    await supabase
      .from("tenants")
      .update({ onboarding_completed: true, onboarding_step: ONBOARDING_STEPS.length - 1 })
      .eq("id", tenantId);
    log.info("Onboarding completed", { tenantId });
  } else {
    await supabase
      .from("tenants")
      .update({ onboarding_step: nextStep })
      .eq("id", tenantId);
  }
}

// Check if a tenant needs onboarding (for middleware enforcement).
export async function needsOnboarding(tenantId: string): Promise<boolean> {
  const { data: tenant } = await supabase
    .from("tenants")
    .select("onboarding_completed")
    .eq("id", tenantId)
    .single();

  return !tenant?.onboarding_completed;
}
