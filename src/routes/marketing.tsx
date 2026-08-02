// Marketing routes — PragmaOS product website (SaaS landing page).
// Served on the main app domains (pragmaos.app, localhost).
// Routes: / (home), /sobre, /contato (commercial lead capture)

import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { z } from "zod";
import { supabase } from "../lib/supabase";
import { log } from "../lib/logger";
import { MarketingLayout } from "../components/marketing-layout";

export const marketingRoutes = new Hono<AppEnv>();

// ============================================================
// Plan catalog (mirrors the plans table seed in migration 0025)
// ============================================================
const PLANS = [
  {
    id: "trial",
    name: "Trial",
    tagline: "14 dias grátis, sem cartão",
    price: "R$ 0",
    period: "/14 dias",
    features: [
      "Acesso completo a todos os recursos",
      "Até 3 usuários",
      "Até 25 processos",
      "IA jurídica incluída",
      "Suporte por e-mail",
    ],
    cta: "Começar agora",
    href: "/signup",
    highlight: false,
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "Para escritórios iniciantes",
    price: "R$ 199",
    period: "/mês",
    features: [
      "Até 10 usuários",
      "Até 500 processos",
      "IA jurídica ilimitada",
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
    period: "/mês",
    features: [
      "Até 50 usuários",
      "Processos ilimitados",
      "IA jurídica ilimitada",
      "WhatsApp Business integrado",
      "Site público + API",
      "Integrações (DataJud, assinaturas)",
      "Gestão de equipe e permissões",
      "Suporte dedicado",
    ],
    cta: "Assinar Pro",
    href: "/signup?plan=pro",
    highlight: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Sob consulta — fale com o comercial",
    price: "Custom",
    period: "",
    features: [
      "Usuários ilimitados",
      "Processos ilimitados",
      "Tudo do Pro +",
      "Onboarding personalizado",
      "SLA e suporte 24/7",
      "Integrações sob medida",
      "Treinamento da equipe",
      "Gerente de conta dedicado",
    ],
    cta: "Falar com comercial",
    href: "/contato?plan=enterprise",
    highlight: false,
  },
];

// ============================================================
// Features grid data
// ============================================================
const FEATURES = [
  { icon: "ph-folder-open", title: "Gestão de Processos", desc: "Centralize todos os processos, andamentos e prazos em um só lugar. Integração automática com DataJud do CNJ." },
  { icon: "ph-calendar-check", title: "Prazos e Audiências", desc: "Cálculo automático de prazos, alertas inteligentes e calendário unificado. Nunca mais perca um prazo." },
  { icon: "ph-currency-dollar", title: "Financeiro Completo", desc: "Honorários, cobranças, fluxo de caixa, relatórios. PIX, boleto e controle de contas trust." },
  { icon: "ph-robot", title: "IA Jurídica", desc: "Resumos de processos, pesquisa de jurisprudência, redação de peças e análise preditiva de resultados." },
  { icon: "ph-whatsapp-logo", title: "WhatsApp Integrado", desc: "Comunique com clientes diretamente da plataforma. Mensagens, arquivos e histórico centralizados." },
  { icon: "ph-signature", title: "Assinaturas Digitais", desc: "Coleta de assinaturas com validade jurídica via Clicksign. Documentos assinados em minutos." },
  { icon: "ph-buildings", title: "Portal do Cliente", desc: "Área exclusiva para clientes acompanharem processos, documentos e faturas. Transparência total." },
  { icon: "ph-chart-line-up", title: "Relatórios e Jurimetria", desc: "Dashboards executivos, análise de performance da equipe e jurimetria preditiva para tomada de decisão." },
];

const STATS = [
  { value: "+500", label: "escritórios ativos" },
  { value: "+50 mil", label: "processos gerenciados" },
  { value: "99,9%", label: "disponibilidade" },
  { value: "4,9/5", label: "satisfação dos clientes" },
];

const TESTIMONIALS = [
  {
    quote: "Reduzimos em 60% o tempo gasto com gestão de prazos. A IA jurídica sozinha já paga a mensalidade.",
    author: "Dr. Rafael Mendes",
    role: "Sócio Fundador, Mendes & Associados",
  },
  {
    quote: "Finalmente uma plataforma que entende o fluxo de um escritório brasileiro. O portal do cliente virou diferencial competitivo.",
    author: "Dra. Carolina Souza",
    role: "Sócia, Souza Advocacia Empresarial",
  },
  {
    quote: "Migramos de planilhas para o PragmaOS em uma semana. A equipe adotou naturalmente. ROI imediato.",
    author: "Dr. Paulo Braga",
    role: "CEO, Braga Lima Advocacia",
  },
];

const FAQS = [
  {
    q: "Preciso instalar algo?",
    a: "Não. O PragmaOS é 100% na nuvem. Você acessa pelo navegador, do computador ou celular. Sem instalação, sem backup manual, sem servidor para manter.",
  },
  {
    q: "Meus dados estão seguros?",
    a: "Sim. Usamos criptografia em trânsito e em repouso, autenticação de dois fatores, backup automático diário e conformidade com a LGPD. Seus dados ficam em datacenters no Brasil.",
  },
  {
    q: "Consigo migrar meus processos existentes?",
    a: "Sim. Oferecemos importação automática via DataJud do CNJ e ferramentas de importação em massa (CSV/Excel). No plano Enterprise, nossa equipe faz a migração completa para você.",
  },
  {
    q: "O trial tem alguma limitação?",
    a: "Não. Durante os 14 dias você tem acesso a todos os recursos do plano Pro, sem restrição e sem cartão de crédito. Ao final, escolhe o plano que faz sentido para o seu escritório.",
  },
  {
    q: "Como funciona o cancelamento?",
    a: "Você pode cancelar a qualquer momento, direto na plataforma, sem multa nem fidelidade. O acesso continua até o fim do período já pago.",
  },
  {
    q: "Vocês atendem escritórios de qualquer tamanho?",
    a: "Sim. Desde advogados solo até escritórios com centenas de profissionais. Os planos são escaláveis e o Enterprise é desenhado sob medida para grandes operações.",
  },
];

// ============================================================
// GET / — Landing page (home)
// ============================================================
marketingRoutes.get("/", (c) => {
  return c.html(
    <MarketingLayout
      title="PragmaOS — Gestão Jurídica All-in-One para Escritórios de Advocacia"
      active="Recursos"
      jsonLd={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }}
    >
      {/* Hero */}
      <section class="gradient-hero text-white">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
          <div class="max-w-3xl">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-sm mb-6">
              <i class="ph-fill ph-check-circle text-terracota-300" aria-hidden="true" />
              <span>Novo: IA jurídica com jurisprudência em tempo real</span>
            </div>
            <h1 class="text-4xl md:text-6xl font-bold font-serif leading-tight text-balance mb-6">
              A gestão jurídica do seu escritório, <span class="text-terracota-300">finalmente em um só lugar.</span>
            </h1>
            <p class="text-lg md:text-xl text-carvao-200 text-pretty mb-8 max-w-2xl">
              Processos, prazos, financeiro, clientes, IA jurídica e WhatsApp — tudo integrado. Pare de perder tempo com planilhas e ferramentas avulsas. Comece grátis em 2 minutos.
            </p>
            <div class="flex flex-col sm:flex-row gap-4">
              <a href="/signup" class="btn btn-primary text-base px-8 py-3.5 inline-flex items-center justify-center gap-2">
                <i class="ph-bold ph-rocket-launch" aria-hidden="true" />
                Começar teste grátis
              </a>
              <a href="/contato" class="px-8 py-3.5 rounded-lg border border-white/30 text-white font-semibold hover:bg-white/10 transition inline-flex items-center justify-center gap-2">
                <i class="ph ph-calendar-blank" aria-hidden="true" />
                Agendar demonstração
              </a>
            </div>
            <p class="text-sm text-carvao-300 mt-4">14 dias grátis. Sem cartão. Cancele quando quiser.</p>
          </div>
        </div>
      </section>

      {/* Logos / social proof */}
      <section class="border-b border-carvao-100 py-8">
        <div class="max-w-6xl mx-auto px-4 sm:px-6">
          <p class="text-center text-xs uppercase tracking-wider text-carvao-400 font-semibold mb-6">Escritórios que confiam no PragmaOS</p>
          <div class="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-carvao-300">
            <span class="text-lg font-serif font-semibold opacity-60">Mendes &amp; Associados</span>
            <span class="text-lg font-serif font-semibold opacity-60">Souza Advocacia</span>
            <span class="text-lg font-serif font-semibold opacity-60">Braga Lima</span>
            <span class="text-lg font-serif font-semibold opacity-60">Oliveira Castro</span>
            <span class="text-lg font-serif font-semibold opacity-60">Ferreira Neto</span>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section class="py-16 bg-carvao-50">
        <div class="max-w-6xl mx-auto px-4 sm:px-6">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {STATS.map((s) => (
              <div>
                <div class="text-3xl md:text-4xl font-bold text-terracota-600 font-serif stat-counter" data-value={s.value}>{s.value}</div>
                <div class="text-sm text-carvao-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem / solution */}
      <section class="py-20 px-4 sm:px-6">
        <div class="max-w-4xl mx-auto text-center">
          <p class="text-sm font-semibold text-terracota-600 uppercase tracking-wider mb-3">O problema</p>
          <h2 class="text-3xl md:text-4xl font-bold font-serif text-carvao-800 text-balance mb-6">
            Seu escritório não deveria ser gerido em planilhas.
          </h2>
          <p class="text-lg text-carvao-500 text-pretty mb-12 max-w-2xl mx-auto">
            Prazos perdidos em e-mails. Financeiro espalhado em abas. Clientes sem visibilidade. Equipe sem clareza. Cada ferramenta avulsa resolve um pedaço — e cria um novo problema de integração.
          </p>
        </div>

        <div class="max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
          <div class="rounded-2xl border border-status-red-border bg-status-red-bg p-6">
            <div class="flex items-center gap-2 mb-4">
              <i class="ph-bold ph-x-circle text-status-red text-xl" aria-hidden="true" />
              <h3 class="font-semibold text-status-red">Sem PragmaOS</h3>
            </div>
            <ul class="space-y-2 text-sm text-carvao-600">
              <li class="flex gap-2"><i class="ph ph-x text-status-red mt-0.5" aria-hidden="true" />Prazos rastreados manualmente em planilhas</li>
              <li class="flex gap-2"><i class="ph ph-x text-status-red mt-0.5" aria-hidden="true" />Financeiro separado dos processos</li>
              <li class="flex gap-2"><i class="ph ph-x text-status-red mt-0.5" aria-hidden="true" />Clientes ligando para saber o andamento</li>
              <li class="flex gap-2"><i class="ph ph-x text-status-red mt-0.5" aria-hidden="true" />Sem visão de produtividade da equipe</li>
              <li class="flex gap-2"><i class="ph ph-x text-status-red mt-0.5" aria-hidden="true" />Pesquisa de jurisprudência manual e lenta</li>
            </ul>
          </div>
          <div class="rounded-2xl border border-status-green-border bg-status-green-bg p-6">
            <div class="flex items-center gap-2 mb-4">
              <i class="ph-bold ph-check-circle text-status-green text-xl" aria-hidden="true" />
              <h3 class="font-semibold text-status-green">Com PragmaOS</h3>
            </div>
            <ul class="space-y-2 text-sm text-carvao-600">
              <li class="flex gap-2"><i class="ph ph-check text-status-green mt-0.5" aria-hidden="true" />Prazos calculados e alertados automaticamente</li>
              <li class="flex gap-2"><i class="ph ph-check text-status-green mt-0.5" aria-hidden="true" />Financeiro vinculado a cada processo</li>
              <li class="flex gap-2"><i class="ph ph-check text-status-green mt-0.5" aria-hidden="true" />Portal do cliente com transparência total</li>
              <li class="flex gap-2"><i class="ph ph-check text-status-green mt-0.5" aria-hidden="true" />Dashboards de performance em tempo real</li>
              <li class="flex gap-2"><i class="ph ph-check text-status-green mt-0.5" aria-hidden="true" />IA que resume, pesquisa e redige por você</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section id="recursos" class="py-20 px-4 sm:px-6 bg-carvao-50">
        <div class="max-w-6xl mx-auto">
          <div class="text-center mb-14">
            <p class="text-sm font-semibold text-terracota-600 uppercase tracking-wider mb-3">Tudo em um</p>
            <h2 class="text-3xl md:text-4xl font-bold font-serif text-carvao-800 text-balance">
              Uma plataforma. Tudo que seu escritório precisa.
            </h2>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f) => (
              <div class="bg-white rounded-2xl p-6 border border-carvao-100 hover:border-terracota-300 hover:shadow-lg transition group">
                <div class="w-12 h-12 rounded-xl bg-terracota-50 flex items-center justify-center mb-4 group-hover:bg-terracota-500 transition">
                  <i class={`ph-bold ${f.icon} text-2xl text-terracota-600 group-hover:text-white transition`} aria-hidden="true" />
                </div>
                <h3 class="font-semibold text-carvao-800 mb-2">{f.title}</h3>
                <p class="text-sm text-carvao-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI highlight */}
      <section class="py-20 px-4 sm:px-6">
        <div class="max-w-5xl mx-auto">
          <div class="rounded-3xl gradient-cta text-white p-8 md:p-14">
            <div class="grid md:grid-cols-2 gap-10 items-center">
              <div>
                <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-sm mb-5">
                  <i class="ph-fill ph-sparkle" aria-hidden="true" /> IA Jurídica
                </div>
                <h2 class="text-3xl md:text-4xl font-bold font-serif mb-4 text-balance">
                  Sua equipe produtiva como nunca antes.
                </h2>
                <p class="text-white/90 text-pretty mb-6">
                  Resumos automáticos de processos, pesquisa de jurisprudência em segundos, redação assistida de peças e análise preditiva de resultados. A IA do PragmaOS entende o contexto jurídico brasileiro.
                </p>
                <ul class="space-y-2 text-sm">
                  <li class="flex items-center gap-2"><i class="ph-fill ph-check-circle" aria-hidden="true" /> Resumo de andamentos em 1 clique</li>
                  <li class="flex items-center gap-2"><i class="ph-fill ph-check-circle" aria-hidden="true" /> Jurisprudência pesquisada por relevância</li>
                  <li class="flex items-center gap-2"><i class="ph-fill ph-check-circle" aria-hidden="true" /> Redação de peças com sua voz</li>
                </ul>
              </div>
              <div class="bg-white/10 rounded-2xl p-6 backdrop-blur border border-white/20">
                <div class="flex items-start gap-3 mb-4">
                  <div class="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    <i class="ph-bold ph-user text-white" aria-hidden="true" />
                  </div>
                  <div class="bg-white/15 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm">
                    Resuma o processo 0012345-67.2024 e identifique os riscos.
                  </div>
                </div>
                <div class="flex items-start gap-3">
                  <div class="w-9 h-9 rounded-lg bg-terracota-300 flex items-center justify-center shrink-0">
                    <i class="ph-bold ph-sparkle text-carvao-800" aria-hidden="true" />
                  </div>
                  <div class="bg-white text-carvao-700 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm">
                    Processo de indenização por responsabilidade civil. Risco médio: 65% de procedência. Audiência de conciliação agendada. Recomendo proposta de acordo...
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section id="integracoes" class="py-20 px-4 sm:px-6 bg-carvao-50">
        <div class="max-w-5xl mx-auto text-center">
          <p class="text-sm font-semibold text-terracota-600 uppercase tracking-wider mb-3">Integrações nativas</p>
          <h2 class="text-3xl md:text-4xl font-bold font-serif text-carvao-800 mb-4 text-balance">
            Conectado ao que já importa para você.
          </h2>
          <p class="text-carvao-500 mb-12 max-w-2xl mx-auto">Dados que antes exigiam cópia manual, agora sincronizados automaticamente.</p>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: "ph-database", name: "DataJud CNJ" },
              { icon: "ph-whatsapp-logo", name: "WhatsApp Business" },
              { icon: "ph-signature", name: "Clicksign" },
              { icon: "ph-newspaper", name: "Diario Oficial" },
              { icon: "ph-envelope-simple", name: "Google Workspace" },
              { icon: "ph-microsoft-outlook-logo", name: "Microsoft 365" },
              { icon: "ph-barcode", name: "Boleto + PIX" },
              { icon: "ph-plugs-connected", name: "API aberta" },
            ].map((i) => (
              <div class="bg-white rounded-xl p-5 border border-carvao-100 flex flex-col items-center gap-2">
                <i class={`ph-bold ${i.icon} text-3xl text-terracota-500`} aria-hidden="true" />
                <span class="text-sm font-medium text-carvao-600">{i.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="depoimentos" class="py-20 px-4 sm:px-6">
        <div class="max-w-5xl mx-auto">
          <div class="text-center mb-14">
            <p class="text-sm font-semibold text-terracota-600 uppercase tracking-wider mb-3">Quem usa, recomenda</p>
            <h2 class="text-3xl md:text-4xl font-bold font-serif text-carvao-800 text-balance">
              Escritórios que transformaram sua operação.
            </h2>
          </div>
          <div class="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <figure class="bg-carvao-50 rounded-2xl p-6 border border-carvao-100">
                <div class="flex gap-0.5 text-terracota-500 mb-4">
                  {[1, 2, 3, 4, 5].map(() => <i class="ph-fill ph-star" aria-hidden="true" />)}
                </div>
                <blockquote class="text-carvao-700 text-pretty mb-5 leading-relaxed">"{t.quote}"</blockquote>
                <figcaption>
                  <div class="font-semibold text-carvao-800 text-sm">{t.author}</div>
                  <div class="text-xs text-carvao-400">{t.role}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="planos" class="py-20 px-4 sm:px-6 bg-carvao-50">
        <div class="max-w-6xl mx-auto">
          <div class="text-center mb-14">
            <p class="text-sm font-semibold text-terracota-600 uppercase tracking-wider mb-3">Planos</p>
            <h2 class="text-3xl md:text-4xl font-bold font-serif text-carvao-800 mb-4 text-balance">
              Preço justo. Sem surpresas.
            </h2>
            <p class="text-carvao-500">Escolha o plano ideal para o momento do seu escritório.</p>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS.map((p) => (
              <div class={`rounded-2xl p-6 flex flex-col transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${p.highlight ? "bg-carvao-800 text-white border-2 border-terracota-500 shadow-xl scale-105" : "bg-white border border-carvao-100 hover:border-terracota-300"}`}>
                {p.highlight && (
                  <div class="inline-flex self-start items-center gap-1 px-2.5 py-1 rounded-full bg-terracota-500 text-white text-xs font-semibold mb-3">
                    <i class="ph-fill ph-star" aria-hidden="true" /> Mais popular
                  </div>
                )}
                <h3 class={`text-lg font-bold mb-1 ${p.highlight ? "text-white" : "text-carvao-800"}`}>{p.name}</h3>
                <p class={`text-sm mb-4 ${p.highlight ? "text-carvao-300" : "text-carvao-400"}`}>{p.tagline}</p>
                <div class="mb-5">
                  <span class={`text-3xl font-bold font-serif ${p.highlight ? "text-white" : "text-carvao-800"}`}>{p.price}</span>
                  {p.period && <span class={`text-sm ${p.highlight ? "text-carvao-300" : "text-carvao-400"}`}>{p.period}</span>}
                </div>
                <ul class="space-y-2.5 text-sm mb-6 flex-1">
                  {p.features.map((f) => (
                    <li class="flex gap-2">
                      <i class={`ph-fill ph-check-circle mt-0.5 ${p.highlight ? "text-terracota-300" : "text-terracota-500"}`} aria-hidden="true" />
                      <span class={p.highlight ? "text-carvao-200" : "text-carvao-600"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={p.href}
                  class={`text-center py-2.5 rounded-lg font-semibold text-sm transition ${p.highlight ? "bg-terracota-500 text-white hover:bg-terracota-600" : "border border-carvao-200 text-carvao-700 hover:border-terracota-400 hover:text-terracota-600"}`}
                >
                  {p.cta}
                </a>
              </div>
            ))}
          </div>
          <p class="text-center text-sm text-carvao-400 mt-8">
            Todos os planos incluem: criptografia, backup diário, suporte e atualizações gratuitas.
          </p>
        </div>
      </section>

      {/* Security */}
      <section id="seguranca" class="py-20 px-4 sm:px-6">
        <div class="max-w-4xl mx-auto">
          <div class="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div class="w-14 h-14 rounded-2xl bg-terracota-50 flex items-center justify-center mb-5">
                <i class="ph-bold ph-shield-check text-3xl text-terracota-600" aria-hidden="true" />
              </div>
              <h2 class="text-3xl font-bold font-serif text-carvao-800 mb-4 text-balance">
                Segurança de nível bancário. Conformidade com a LGPD.
              </h2>
              <p class="text-carvao-500 mb-6 text-pretty">
                Seus dados são o seu negócio. Por isso tratamos segurança como prioridade absoluta — não como recurso.
              </p>
              <ul class="space-y-3 text-sm">
                <li class="flex items-center gap-3"><i class="ph-bold ph-lock-key text-terracota-500 text-lg" aria-hidden="true" /><span class="text-carvao-600">Criptografia AES-256 em repouso e TLS 1.3 em trânsito</span></li>
                <li class="flex items-center gap-3"><i class="ph-bold ph-user-circle-check text-terracota-500 text-lg" aria-hidden="true" /><span class="text-carvao-600">Autenticação de dois fatores (2FA) e login com Gov.br</span></li>
                <li class="flex items-center gap-3"><i class="ph-bold ph-database text-terracota-500 text-lg" aria-hidden="true" /><span class="text-carvao-600">Backup automático diário com retenção de 30 dias</span></li>
                <li class="flex items-center gap-3"><i class="ph-bold ph-map-pin text-terracota-500 text-lg" aria-hidden="true" /><span class="text-carvao-600">Dados hospedados em datacenters no Brasil</span></li>
                <li class="flex items-center gap-3"><i class="ph-bold ph-file-text text-terracota-500 text-lg" aria-hidden="true" /><span class="text-carvao-600">Conformidade plena com a LGPD</span></li>
              </ul>
            </div>
            <div class="bg-carvao-50 rounded-3xl p-8 border border-carvao-100">
              <div class="grid grid-cols-2 gap-4">
                <div class="bg-white rounded-xl p-5 text-center border border-carvao-100">
                  <i class="ph-bold ph-shield-check text-3xl text-status-green mb-2" aria-hidden="true" />
                  <div class="text-xs font-semibold text-carvao-600">LGPD</div>
                </div>
                <div class="bg-white rounded-xl p-5 text-center border border-carvao-100">
                  <i class="ph-bold ph-lock text-3xl text-status-blue mb-2" aria-hidden="true" />
                  <div class="text-xs font-semibold text-carvao-600">AES-256</div>
                </div>
                <div class="bg-white rounded-xl p-5 text-center border border-carvao-100">
                  <i class="ph-bold ph-clock-countdown text-3xl text-terracota-600 mb-2" aria-hidden="true" />
                  <div class="text-xs font-semibold text-carvao-600">99,9% uptime</div>
                </div>
                <div class="bg-white rounded-xl p-5 text-center border border-carvao-100">
                  <i class="ph-bold ph-flag-banner text-3xl text-carvao-700 mb-2" aria-hidden="true" />
                  <div class="text-xs font-semibold text-carvao-600">100% Brasil</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" class="py-20 px-4 sm:px-6 bg-carvao-50">
        <div class="max-w-3xl mx-auto">
          <div class="text-center mb-12">
            <p class="text-sm font-semibold text-terracota-600 uppercase tracking-wider mb-3">Dúvidas frequentes</p>
            <h2 class="text-3xl md:text-4xl font-bold font-serif text-carvao-800 text-balance">
              Tudo que você precisa saber.
            </h2>
          </div>
          <div class="space-y-3" {...{ "x-data": "{ open: 0 }" }}>
            {FAQS.map((f, i) => (
              <div class="bg-white rounded-xl border border-carvao-100 overflow-hidden">
                <button
                  class="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                  {...{ "@click": `open = open === ${i + 1} ? 0 : ${i + 1}` }}
                >
                  <span class="font-semibold text-carvao-800">{f.q}</span>
                  <i class="ph ph-caret-down text-terracota-500 transition-transform" {...{ ":class": `open === ${i + 1} ? 'rotate-180' : ''` }} aria-hidden="true" />
                </button>
                <div {...{ "x-show": `open === ${i + 1}` }} x-cloak {...{ "x-transition": "" }} class="px-5 pb-4 text-sm text-carvao-500 leading-relaxed">
                  {f.a}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section class="gradient-hero text-white py-20 px-4 sm:px-6">
        <div class="max-w-3xl mx-auto text-center">
          <h2 class="text-3xl md:text-5xl font-bold font-serif mb-5 text-balance">
            Pronto para transformar seu escritório?
          </h2>
          <p class="text-lg text-carvao-200 mb-8 text-pretty">
            Comece hoje. 14 dias grátis, sem cartão de crédito. Em 2 minutos você está dentro.
          </p>
          <div class="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/signup" class="btn btn-primary text-base px-8 py-3.5 inline-flex items-center justify-center gap-2">
              <i class="ph-bold ph-rocket-launch" aria-hidden="true" />
              Criar conta grátis
            </a>
            <a href="/contato" class="px-8 py-3.5 rounded-lg border border-white/30 text-white font-semibold hover:bg-white/10 transition inline-flex items-center justify-center gap-2">
              <i class="ph ph-chats-circle" aria-hidden="true" />
              Falar com o comercial
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>,
  );
});

// ============================================================
// GET /sobre — About page
// ============================================================
marketingRoutes.get("/sobre", (c) => {
  return c.html(
    <MarketingLayout title="Sobre o PragmaOS — Nossa Missão" active="Sobre" description="O PragmaOS nasceu para devolver tempo aos advogados. Conheça nossa história e missão.">
      <section class="py-20 px-4 sm:px-6">
        <div class="max-w-3xl mx-auto">
          <h1 class="text-4xl md:text-5xl font-bold font-serif text-carvao-800 mb-6 text-balance">Construído por quem entende o jurídico brasileiro.</h1>
          <p class="text-lg text-carvao-500 mb-8 text-pretty">
            O PragmaOS nasceu de uma frustração simples: escritórios de advocacia no Brasil operavam com ferramentas pensadas para outros setores — ou pior, com planilhas. Prazos se perdiam, o financeiro vivia desconectado dos processos, e a equipe gastava horas em tarefas que a tecnologia já conseguia resolver.
          </p>
          <p class="text-lg text-carvao-500 mb-8 text-pretty">
            Nossa missão é clara: devolver tempo aos advogados. Cada feature do PragmaOS existe para eliminar uma fricção real, vivida por escritórios reais. Não construímos para o mercado global — construímos para o Brasil, com DataJud, OAB, LGPD e a realidade do foro brasileiro no DNA.
          </p>
          <div class="grid grid-cols-3 gap-6 my-12 text-center">
            <div>
              <div class="text-3xl font-bold text-terracota-600 font-serif">2024</div>
              <div class="text-sm text-carvao-400">Fundação</div>
            </div>
            <div>
              <div class="text-3xl font-bold text-terracota-600 font-serif">+500</div>
              <div class="text-sm text-carvao-400">Escritorios</div>
            </div>
            <div>
              <div class="text-3xl font-bold text-terracota-600 font-serif">BR</div>
              <div class="text-sm text-carvao-400">100% nacional</div>
            </div>
          </div>
          <h2 class="text-2xl font-bold font-serif text-carvao-800 mb-4">Nossos valores</h2>
          <ul class="space-y-4 text-carvao-600">
            <li class="flex gap-3"><i class="ph-bold ph-target text-terracota-500 text-xl mt-0.5" aria-hidden="true" /><div><strong>Tempo é o ativo mais valioso.</strong> Tudo que automatizamos é tempo que devolvemos ao advogado para o que importa: estratégia e relacionamento.</div></li>
            <li class="flex gap-3"><i class="ph-bold ph-shield-check text-terracota-500 text-xl mt-0.5" aria-hidden="true" /><div><strong>Segurança não é negociável.</strong> Dados jurídicos são sensíveis. Tratamos cada byte como se fosse nosso.</div></li>
            <li class="flex gap-3"><i class="ph-bold ph-flag-banner text-terracota-500 text-xl mt-0.5" aria-hidden="true" /><div><strong>Feito para o Brasil.</strong> Não adaptamos um produto gringo. Construímos do zero para a realidade do foro brasileiro.</div></li>
          </ul>
        </div>
      </section>
    </MarketingLayout>,
  );
});

// ============================================================
// GET /contato — Commercial lead capture form (B2B)
// ============================================================
const leadSchema = z.object({
  name: z.string().min(2, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  team_size: z.string().optional(),
  message: z.string().optional(),
  interested_plan: z.string().optional(),
});

marketingRoutes.get("/contato", (c) => {
  const interestedPlan = c.req.query("plan") ?? c.req.query("interested_plan") ?? "";
  const success = c.req.query("success") === "1";
  const error = c.req.query("error");
  // Preserve form data on validation error
  const pref = (k: string) => c.req.query(k) ?? "";
  return c.html(
    <MarketingLayout title="Fale com o Comercial — PragmaOS" active="Contato" description="Agende uma demonstração do PragmaOS com nosso time comercial. Soluções para escritórios de qualquer tamanho.">
      <section class="py-16 md:py-24 px-4 sm:px-6">
        <div class="max-w-5xl mx-auto grid md:grid-cols-2 gap-12">
          {/* Copy side */}
          <div>
            <h1 class="text-3xl md:text-4xl font-bold font-serif text-carvao-800 mb-5 text-balance">
              Vamos conversar sobre o seu escritório.
            </h1>
            <p class="text-lg text-carvao-500 mb-8 text-pretty">
              Preencha o formulário e nosso time comercial entra em contato em até 1 dia útil. Para o plano Enterprise, agendamos uma demonstração personalizada.
            </p>
            <div class="space-y-4">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg bg-terracota-50 flex items-center justify-center shrink-0">
                  <i class="ph-bold ph-envelope text-terracota-600" aria-hidden="true" />
                </div>
                <div>
                  <div class="font-semibold text-carvao-800 text-sm">E-mail comercial</div>
                  <a href="mailto:comercial@pragmaos.com.br" class="text-sm text-terracota-600 hover:underline">comercial@pragmaos.com.br</a>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg bg-terracota-50 flex items-center justify-center shrink-0">
                  <i class="ph-bold ph-whatsapp-logo text-terracota-600" aria-hidden="true" />
                </div>
                <div>
                  <div class="font-semibold text-carvao-800 text-sm">WhatsApp</div>
                  <a href="https://wa.me/5511999999999" class="text-sm text-terracota-600 hover:underline">+55 11 99999-9999</a>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg bg-terracota-50 flex items-center justify-center shrink-0">
                  <i class="ph-bold ph-clock text-terracota-600" aria-hidden="true" />
                </div>
                <div>
                  <div class="font-semibold text-carvao-800 text-sm">Tempo de resposta</div>
                  <span class="text-sm text-carvao-500">Até 1 dia útil</span>
                </div>
              </div>
            </div>
          </div>

          {/* Form side */}
          <div class="bg-carvao-50 rounded-2xl p-6 md:p-8 border border-carvao-100">
            {success ? (
              <div class="text-center py-10">
                <div class="w-16 h-16 rounded-full bg-status-green-bg flex items-center justify-center mx-auto mb-4">
                  <i class="ph-bold ph-check-circle text-3xl text-status-green" aria-hidden="true" />
                </div>
                <h2 class="text-xl font-bold text-carvao-800 mb-2">Recebemos seu contato!</h2>
                <p class="text-sm text-carvao-500 mb-6">Nosso time comercial entrará em contato em breve. Obrigado pelo interesse.</p>
                <a href="/" class="btn btn-secondary text-sm">Voltar ao início</a>
              </div>
            ) : (
              <>
                {error && (
                  <div class="bg-status-red-bg border border-status-red text-status-red px-4 py-3 rounded-lg mb-4 text-sm">
                    {decodeURIComponent(error).replace(/</g, "&lt;").replace(/>/g, "&gt;")}
                  </div>
                )}
                <form method="post" action="/contato" class="flex flex-col gap-4">
                <div>
                  <label for="name" class="block text-sm font-semibold text-carvao-700 mb-1">Nome completo *</label>
                  <input id="name" name="name" type="text" required placeholder="Seu nome" value={pref("name")} class="input w-full" />
                </div>
                <div>
                  <label for="email" class="block text-sm font-semibold text-carvao-700 mb-1">E-mail *</label>
                  <input id="email" name="email" type="email" required placeholder="voce@escritorio.com" value={pref("email")} class="input w-full" />
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label for="phone" class="block text-sm font-semibold text-carvao-700 mb-1">Telefone</label>
                    <input id="phone" name="phone" type="tel" placeholder="(11) 99999-9999" value={pref("phone")} class="input w-full" />
                  </div>
                  <div>
                    <label for="company" class="block text-sm font-semibold text-carvao-700 mb-1">Escritório</label>
                    <input id="company" name="company" type="text" placeholder="Nome do escritório" value={pref("company")} class="input w-full" />
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label for="role" class="block text-sm font-semibold text-carvao-700 mb-1">Cargo</label>
                    <select id="role" name="role" class="input w-full">
                      <option value="">Selecione</option>
                      <option value="socio" selected={pref("role") === "socio"}>Sócio / Sócia</option>
                      <option value="advogado" selected={pref("role") === "advogado"}>Advogado(a)</option>
                      <option value="gerente" selected={pref("role") === "gerente"}>Gerente</option>
                      <option value="ceo" selected={pref("role") === "ceo"}>CEO / Diretor(a)</option>
                      <option value="outro" selected={pref("role") === "outro"}>Outro</option>
                    </select>
                  </div>
                  <div>
                    <label for="team_size" class="block text-sm font-semibold text-carvao-700 mb-1">Tamanho da equipe</label>
                    <select id="team_size" name="team_size" class="input w-full">
                      <option value="">Selecione</option>
                      <option value="1-5" selected={pref("team_size") === "1-5"}>1-5 pessoas</option>
                      <option value="6-20" selected={pref("team_size") === "6-20"}>6-20 pessoas</option>
                      <option value="21-50" selected={pref("team_size") === "21-50"}>21-50 pessoas</option>
                      <option value="50+" selected={pref("team_size") === "50+"}>50+ pessoas</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label for="interested_plan" class="block text-sm font-semibold text-carvao-700 mb-1">Plano de interesse</label>
                  <select id="interested_plan" name="interested_plan" class="input w-full">
                    <option value="">Selecione</option>
                    <option value="starter" selected={interestedPlan === "starter"}>Starter — R$ 199/mês</option>
                    <option value="pro" selected={interestedPlan === "pro"}>Pro — R$ 499/mês</option>
                    <option value="enterprise" selected={interestedPlan === "enterprise"}>Enterprise — sob consulta</option>
                    <option value="trial" selected={interestedPlan === "trial"}>Ainda não sei / Trial</option>
                  </select>
                </div>
                <div>
                  <label for="message" class="block text-sm font-semibold text-carvao-700 mb-1">Mensagem (opcional)</label>
                  <textarea id="message" name="message" rows={3} placeholder="Conte-nos sobre seu escritório e o que procura." class="input w-full">{pref("message")}</textarea>
                </div>
                <button type="submit" class="btn btn-primary w-full flex items-center justify-center gap-2">
                  <i class="ph-bold ph-paper-plane-tilt" aria-hidden="true" />
                  Enviar para o comercial
                </button>
                <p class="text-xs text-carvao-400 text-center">Ao enviar, você concorda com nossa política de privacidade. Não compartilhamos seus dados.</p>
              </form>
              </>
            )}
          </div>
        </div>
      </section>
    </MarketingLayout>,
  );
});

// POST /contato — save commercial lead
marketingRoutes.post("/contato", async (c) => {
  const body = await c.req.formData();
  const parsed = leadSchema.safeParse({
    name: body.get("name"),
    email: body.get("email"),
    phone: body.get("phone") || undefined,
    company: body.get("company") || undefined,
    role: body.get("role") || undefined,
    team_size: body.get("team_size") || undefined,
    message: body.get("message") || undefined,
    interested_plan: body.get("interested_plan") || undefined,
  });

  if (!parsed.success) {
    const params = new URLSearchParams();
    params.set("error", parsed.error.issues[0]?.message ?? "Dados inválidos");
    // Preserve form data so user doesn't lose what they typed
    for (const key of ["name", "email", "phone", "company", "role", "team_size", "interested_plan", "message"]) {
      const val = body.get(key);
      if (val) params.set(key, String(val));
    }
    return c.redirect(`/contato?${params.toString()}`);
  }

  const { error } = await supabase.from("commercial_leads").insert({
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone ?? null,
    company: parsed.data.company ?? null,
    role: parsed.data.role ?? null,
    team_size: parsed.data.team_size ?? null,
    message: parsed.data.message ?? null,
    interested_plan: parsed.data.interested_plan ?? null,
    source: "landing_page",
    status: "new",
  });

  if (error) {
    log.error("Failed to save commercial lead", { email: parsed.data.email, error: error.message });
  }

  return c.redirect("/contato?success=1");
});

// ============================================================
// GET /robots.txt
// ============================================================
marketingRoutes.get("/robots.txt", (c) => {
  const body = `User-agent: *
Allow: /
Disallow: /login
Disallow: /signup
Disallow: /dashboard
Disallow: /api/

Sitemap: https://pragmaos.app/sitemap.xml`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
});

// ============================================================
// GET /sitemap.xml
// ============================================================
marketingRoutes.get("/sitemap.xml", (c) => {
  const urls = [
    { loc: "https://pragmaos.app/", priority: "1.0", changefreq: "weekly" },
    { loc: "https://pragmaos.app/sobre", priority: "0.8", changefreq: "monthly" },
    { loc: "https://pragmaos.app/contato", priority: "0.8", changefreq: "monthly" },
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
});
