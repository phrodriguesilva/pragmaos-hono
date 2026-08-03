// Shared plan catalog — single source of truth for marketing and subscription.
// Mirrors the plans table seed in migration 0025.

export interface Plan {
  id: string;
  name: string;
  tagline: string;
  price: string; // display string for marketing (e.g. "R$ 199")
  priceCents: number; // numeric monthly price in cents for billing
  period: string;
  features: string[];
  footnote?: string;
  cta: string;
  href: string;
  highlight: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "trial",
    name: "Trial",
    tagline: "14 dias grátis, sem cartão",
    price: "R$ 0",
    priceCents: 0,
    period: "/14 dias",
    features: [
      "Acesso completo a todos os recursos",
      "Até 3 usuários",
      "Até 25 processos",
      "50 interações de IA/mês",
      "Suporte por e-mail",
    ],
    cta: "Começar agora",
    href: "/signup",
    highlight: false,
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "Para advogados solo e pequenos escritórios",
    price: "R$ 199",
    priceCents: 19900,
    period: "/mês",
    features: [
      "Até 3 usuários",
      "Até 500 processos",
      "50 interações de IA/mês",
      "Site público da advocacia",
      "Suporte prioritário",
      "Relatórios financeiros",
    ],
    cta: "Assinar Starter",
    href: "/signup?plan=starter",
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Para escritórios em crescimento",
    price: "R$ 499",
    priceCents: 49900,
    period: "/mês",
    features: [
      "Até 10 usuários",
      "Processos ilimitados",
      "300 interações de IA/mês",
      "WhatsApp Business integrado*",
      "Site público + API",
      "Integrações (DataJud, assinaturas)",
      "Gestão de equipe e permissões",
      "Suporte dedicado",
    ],
    footnote: "*Custos de conversas da Meta (WhatsApp) são repassados ao cliente.",
    cta: "Assinar Pro",
    href: "/signup?plan=pro",
    highlight: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Sob consulta — fale com o comercial",
    price: "Custom",
    priceCents: 0,
    period: "",
    features: [
      "Usuários ilimitados",
      "Processos ilimitados",
      "Franquia de IA sob medida",
      "Tudo do Pro +",
      "Onboarding personalizado",
      "SLA e suporte 24/7",
      "Integrações sob medida",
      "Gerente de conta dedicado",
    ],
    cta: "Falar com comercial",
    href: "/contato?plan=enterprise",
    highlight: false,
  },
];

// Derived lookup maps for subscription/billing use.

export const PLAN_INFO: Record<string, { name: string; price: number; tagline: string }> =
  Object.fromEntries(
    PLANS.map((p) => [p.id, { name: p.name, price: p.priceCents, tagline: p.tagline }]),
  );

export const PLAN_FEATURES: Record<string, string[]> = Object.fromEntries(
  PLANS.map((p) => [p.id, p.features]),
);

export const PRO_FOOTNOTE = "*Custos de conversas da Meta (WhatsApp) são repassados ao cliente.";
