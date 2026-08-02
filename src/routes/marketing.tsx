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
    tagline: "14 dias gratis, sem cartao",
    price: "R$ 0",
    period: "/14 dias",
    features: [
      "Acesso completo a todos os recursos",
      "Ate 3 usuarios",
      "Ate 25 processos",
      "IA juridica incluida",
      "Suporte por e-mail",
    ],
    cta: "Comecar agora",
    href: "/signup",
    highlight: false,
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "Para escritorios iniciantes",
    price: "R$ 199",
    period: "/mes",
    features: [
      "Ate 10 usuarios",
      "Ate 500 processos",
      "IA juridica ilimitada",
      "Site publico da advocacia",
      "Suporte prioritario",
      "Relatorios financeiros",
    ],
    cta: "Assinar Starter",
    href: "/signup?plan=starter",
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Para escritorios em crescimento",
    price: "R$ 499",
    period: "/mes",
    features: [
      "Ate 50 usuarios",
      "Processos ilimitados",
      "IA juridica ilimitada",
      "WhatsApp Business integrado",
      "Site publico + API",
      "Integracoes (DataJud, assinaturas)",
      "Gestao de equipe e permissoes",
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
      "Usuarios ilimitados",
      "Processos ilimitados",
      "Tudo do Pro +",
      "Onboarding personalizado",
      "SLA e suporte 24/7",
      "Integracoes sob medida",
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
  { icon: "ph-folder-open", title: "Gestao de Processos", desc: "Centralize todos os processos, andamentos e prazos em um so lugar. Integricao automatica com DataJud do CNJ." },
  { icon: "ph-calendar-check", title: "Prazos e Audiencias", desc: "Calculo automatico de prazos, alertas inteligentes e calendario unificado. Nunca mais perca um prazo." },
  { icon: "ph-currency-dollar", title: "Financeiro Completo", desc: "Honorarios, cobrancas, fluxo de caixa, relatorios. PIX, boleto e controle de contas trust." },
  { icon: "ph-robot", title: "IA Juridica", desc: "Resumos de processos, pesquisa de jurisprudencia, redacao de pecas e analise preditiva de resultados." },
  { icon: "ph-whatsapp-logo", title: "WhatsApp Integrado", desc: "Comunique com clientes diretamente da plataforma. Mensagens, arquivos e historico centralizados." },
  { icon: "ph-signature", title: "Assinaturas Digitais", desc: "Coleta de assinaturas com validade juridica via Clicksign. Documentos assinados em minutos." },
  { icon: "ph-buildings", title: "Portal do Cliente", desc: "Area exclusiva para clientes acompanharem processos, documentos e faturas. Transparencia total." },
  { icon: "ph-chart-line-up", title: "Relatorios e Jurimetria", desc: "Dashboards executivos, analise de performance da equipe e jurimetria preditiva para tomada de decisao." },
];

const STATS = [
  { value: "+500", label: "escritorios ativos" },
  { value: "+50 mil", label: "processos gerenciados" },
  { value: "99,9%", label: "disponibilidade" },
  { value: "4,9/5", label: "satisfacao dos clientes" },
];

const TESTIMONIALS = [
  {
    quote: "Reduzimos em 60% o tempo gasto com gestao de prazos. A IA juridica sozinha ja paga a mensalidade.",
    author: "Dr. Rafael Mendes",
    role: "Socio Fundador, Mendes & Associados",
  },
  {
    quote: "Finalmente uma plataforma que entende o fluxo de um escritorio brasileiro. O portal do cliente virou diferencial competitivo.",
    author: "Dra. Carolina Souza",
    role: "Socia, Souza Advocacia Empresarial",
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
    a: "Nao. O PragmaOS e 100% na nuvem. Voce acessa pelo navegador, do computador ou celular. Sem instalacao, sem backup manual, sem servidor para manter.",
  },
  {
    q: "Meus dados estao seguros?",
    a: "Sim. Usamos criptografia em transito e em repouso, autenticacao de dois fatores, backup automatico diario e conformidade com a LGPD. Seus dados ficam em datacenters no Brasil.",
  },
  {
    q: "Consigo migrar meus processos existentes?",
    a: "Sim. Oferecemos importacao automatica via DataJud do CNJ e ferramentas de importacao em massa (CSV/Excel). No plano Enterprise, nossa equipe faz a migracao completa para voce.",
  },
  {
    q: "O trial tem alguma limitacao?",
    a: "Nao. Durante os 14 dias voce tem acesso a todos os recursos do plano Pro, sem restricao e sem cartao de credito. Ao final, escolhe o plano que faz sentido para o seu escritorio.",
  },
  {
    q: "Como funciona o cancelamento?",
    a: "Voce pode cancelar a qualquer momento, direto na plataforma, sem multa nem fidelidade. O acesso continua ate o fim do periodo ja pago.",
  },
  {
    q: "Voces atendem escritorios de qualquer tamanho?",
    a: "Sim. Desde advogados solo ate escritorios com centenas de profissionais. Os planos sao escalaveis e o Enterprise e desenhado sob medida para grandes operacoes.",
  },
];

// ============================================================
// GET / — Landing page (home)
// ============================================================
marketingRoutes.get("/", (c) => {
  return c.html(
    <MarketingLayout title="PragmaOS — Gestao Juridica All-in-One para Escritorios de Advocacia" active="Recursos">
      {/* Hero */}
      <section class="gradient-hero text-white">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
          <div class="max-w-3xl">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-sm mb-6">
              <i class="ph-fill ph-check-circle text-terracota-300" aria-hidden="true" />
              <span>Novo: IA juridica com jurisprudencia em tempo real</span>
            </div>
            <h1 class="text-4xl md:text-6xl font-bold font-serif leading-tight text-balance mb-6">
              A gestao juridica do seu escritorio, <span class="text-terracota-300">finalmente em um so lugar.</span>
            </h1>
            <p class="text-lg md:text-xl text-carvao-200 text-pretty mb-8 max-w-2xl">
              Processos, prazos, financeiro, clientes, IA juridica e WhatsApp — tudo integrado. Pare de perder tempo com planilhas e ferramentas avulsas. Comece gratis em 2 minutos.
            </p>
            <div class="flex flex-col sm:flex-row gap-4">
              <a href="/signup" class="btn btn-primary text-base px-8 py-3.5 inline-flex items-center justify-center gap-2">
                <i class="ph-bold ph-rocket-launch" aria-hidden="true" />
                Comecar teste gratis
              </a>
              <a href="/contato" class="px-8 py-3.5 rounded-lg border border-white/30 text-white font-semibold hover:bg-white/10 transition inline-flex items-center justify-center gap-2">
                <i class="ph ph-calendar-blank" aria-hidden="true" />
                Agendar demonstracao
              </a>
            </div>
            <p class="text-sm text-carvao-300 mt-4">14 dias gratis. Sem cartao. Cancele quando quiser.</p>
          </div>
        </div>
      </section>

      {/* Logos / social proof */}
      <section class="border-b border-carvao-100 py-8">
        <div class="max-w-6xl mx-auto px-4 sm:px-6">
          <p class="text-center text-xs uppercase tracking-wider text-carvao-400 font-semibold mb-6">Escritorios que confiam no PragmaOS</p>
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
                <div class="text-3xl md:text-4xl font-bold text-terracota-600 font-serif">{s.value}</div>
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
            Seu escritorio nao deveria ser gerido em planilhas.
          </h2>
          <p class="text-lg text-carvao-500 text-pretty mb-12 max-w-2xl mx-auto">
            Prazos perdidos em e-mails. Financeiro espalhado em abas. Clientes sem visibilidade. Equipe sem clareza. Cada ferramenta avulsa resolve um pedaco — e cria um novo problema de integracao.
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
              <li class="flex gap-2"><i class="ph ph-x text-status-red mt-0.5" aria-hidden="true" />Sem visao de produtividade da equipe</li>
              <li class="flex gap-2"><i class="ph ph-x text-status-red mt-0.5" aria-hidden="true" />Pesquisa de jurisprudencia manual e lenta</li>
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
              <li class="flex gap-2"><i class="ph ph-check text-status-green mt-0.5" aria-hidden="true" />Portal do cliente com transparencia total</li>
              <li class="flex gap-2"><i class="ph ph-check text-status-green mt-0.5" aria-hidden="true" />Dashboards de performance em tempo real</li>
              <li class="flex gap-2"><i class="ph ph-check text-status-green mt-0.5" aria-hidden="true" />IA que resume, pesquisa e redige por voce</li>
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
              Uma plataforma. Tudo que seu escritorio precisa.
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
                  <i class="ph-fill ph-sparkle" aria-hidden="true" /> IA Juridica
                </div>
                <h2 class="text-3xl md:text-4xl font-bold font-serif mb-4 text-balance">
                  Sua equipe produtiva como nunca antes.
                </h2>
                <p class="text-white/90 text-pretty mb-6">
                  Resumos automaticos de processos, pesquisa de jurisprudencia em segundos, redacao assistida de pecas e analise preditiva de resultados. A IA do PragmaOS entende o contexto juridico brasileiro.
                </p>
                <ul class="space-y-2 text-sm">
                  <li class="flex items-center gap-2"><i class="ph-fill ph-check-circle" aria-hidden="true" /> Resumo de andamentos em 1 clique</li>
                  <li class="flex items-center gap-2"><i class="ph-fill ph-check-circle" aria-hidden="true" /> Jurisprudencia pesquisada por relevancia</li>
                  <li class="flex items-center gap-2"><i class="ph-fill ph-check-circle" aria-hidden="true" /> Redacao de pecas com sua voz</li>
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
                    Processo de indenizacao por responsabilidade civil. Risco medio: 65% de procedencia. Audiencia de conciliacao agendada. Recomendo proposta de acordo...
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
          <p class="text-sm font-semibold text-terracota-600 uppercase tracking-wider mb-3">Integracoes nativas</p>
          <h2 class="text-3xl md:text-4xl font-bold font-serif text-carvao-800 mb-4 text-balance">
            Conectado ao que ja importa para voce.
          </h2>
          <p class="text-carvao-500 mb-12 max-w-2xl mx-auto">Dados que antes exigiam copia manual, agora sincronizados automaticamente.</p>
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
              Escritorios que transformaram sua operacao.
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
              Preco justo. Sem surpresas.
            </h2>
            <p class="text-carvao-500">Escolha o plano ideal para o momento do seu escritorio.</p>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS.map((p) => (
              <div class={`rounded-2xl p-6 flex flex-col ${p.highlight ? "bg-carvao-800 text-white border-2 border-terracota-500 shadow-xl scale-105" : "bg-white border border-carvao-100"}`}>
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
            Todos os planos incluem: criptografia, backup diario, suporte e atualizacoes gratuitas.
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
                Seguranca de nivel bancario. Conformidade com a LGPD.
              </h2>
              <p class="text-carvao-500 mb-6 text-pretty">
                Seus dados sao o seu negocio. Por isso tratamos seguranca como prioridade absoluta — nao como recurso.
              </p>
              <ul class="space-y-3 text-sm">
                <li class="flex items-center gap-3"><i class="ph-bold ph-lock-key text-terracota-500 text-lg" aria-hidden="true" /><span class="text-carvao-600">Criptografia AES-256 em repouso e TLS 1.3 em transito</span></li>
                <li class="flex items-center gap-3"><i class="ph-bold ph-user-circle-check text-terracota-500 text-lg" aria-hidden="true" /><span class="text-carvao-600">Autenticacao de dois fatores (2FA) e login com Gov.br</span></li>
                <li class="flex items-center gap-3"><i class="ph-bold ph-database text-terracota-500 text-lg" aria-hidden="true" /><span class="text-carvao-600">Backup automatico diario com retensao de 30 dias</span></li>
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
            <p class="text-sm font-semibold text-terracota-600 uppercase tracking-wider mb-3">Duvidas frequentes</p>
            <h2 class="text-3xl md:text-4xl font-bold font-serif text-carvao-800 text-balance">
              Tudo que voce precisa saber.
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
            Pronto para transformar seu escritorio?
          </h2>
          <p class="text-lg text-carvao-200 mb-8 text-pretty">
            Comece hoje. 14 dias gratis, sem cartao de credito. Em 2 minutos voce esta dentro.
          </p>
          <div class="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/signup" class="btn btn-primary text-base px-8 py-3.5 inline-flex items-center justify-center gap-2">
              <i class="ph-bold ph-rocket-launch" aria-hidden="true" />
              Criar conta gratis
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
    <MarketingLayout title="Sobre o PragmaOS — Nossa Missao" active="Clientes" description="O PragmaOS nasceu para devolver tempo aos advogados. Conheca nossa historia e missao.">
      <section class="py-20 px-4 sm:px-6">
        <div class="max-w-3xl mx-auto">
          <h1 class="text-4xl md:text-5xl font-bold font-serif text-carvao-800 mb-6 text-balance">Construido por quem entende o juridico brasileiro.</h1>
          <p class="text-lg text-carvao-500 mb-8 text-pretty">
            O PragmaOS nasceu de uma frustracao simples: escritorios de advocacia no Brasil operavam com ferramentas pensadas para outros setores — ou pior, com planilhas. Prazos se perdiam, o financeiro vivia desconectado dos processos, e a equipe gastava horas em tarefas que a tecnologia ja conseguia resolver.
          </p>
          <p class="text-lg text-carvao-500 mb-8 text-pretty">
            Nossa missao e clara: devolver tempo aos advogados. Cada feature do PragmaOS existe para eliminar uma friccao real, vivida por escritorios reais. Nao construímos para o mercado global — construímos para o Brasil, com DataJud, OAB, LGPD e a realidade do foro brasileiro no DNA.
          </p>
          <div class="grid grid-cols-3 gap-6 my-12 text-center">
            <div>
              <div class="text-3xl font-bold text-terracota-600 font-serif">2024</div>
              <div class="text-sm text-carvao-400">Fundacao</div>
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
            <li class="flex gap-3"><i class="ph-bold ph-target text-terracota-500 text-xl mt-0.5" aria-hidden="true" /><div><strong>Tempo e o ativo mais valioso.</strong> Tudo que automatizamos e tempo que devolvemos ao advogado para o que importa: estrategia e relacionamento.</div></li>
            <li class="flex gap-3"><i class="ph-bold ph-shield-check text-terracota-500 text-xl mt-0.5" aria-hidden="true" /><div><strong>Seguranca nao e negociavel.</strong> Dados juridicos sao sensíveis. Tratamos cada byte como se fosse nosso.</div></li>
            <li class="flex gap-3"><i class="ph-bold ph-flag-banner text-terracota-500 text-xl mt-0.5" aria-hidden="true" /><div><strong>Feito para o Brasil.</strong> Nao adaptamos um produto gringo. Construímos do zero para a realidade do foro brasileiro.</div></li>
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
  name: z.string().min(2, "Nome e obrigatorio"),
  email: z.string().email("E-mail invalido"),
  phone: z.string().optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  team_size: z.string().optional(),
  message: z.string().optional(),
  interested_plan: z.string().optional(),
});

marketingRoutes.get("/contato", (c) => {
  const interestedPlan = c.req.query("plan") ?? "";
  const success = c.req.query("success") === "1";
  return c.html(
    <MarketingLayout title="Fale com o Comercial — PragmaOS" active="Contato" description="Agende uma demonstracao do PragmaOS com nosso time comercial. Solucoes para escritorios de qualquer tamanho.">
      <section class="py-16 md:py-24 px-4 sm:px-6">
        <div class="max-w-5xl mx-auto grid md:grid-cols-2 gap-12">
          {/* Copy side */}
          <div>
            <h1 class="text-3xl md:text-4xl font-bold font-serif text-carvao-800 mb-5 text-balance">
              Vamos conversar sobre o seu escritorio.
            </h1>
            <p class="text-lg text-carvao-500 mb-8 text-pretty">
              Preencha o formulario e nosso time comercial entra em contato em ate 1 dia util. Para o plano Enterprise, agendamos uma demonstracao personalizada.
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
                  <span class="text-sm text-carvao-500">Ate 1 dia util</span>
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
                <p class="text-sm text-carvao-500 mb-6">Nosso time comercial entrara em contato em breve. Obrigado pelo interesse.</p>
                <a href="/" class="btn btn-secondary text-sm">Voltar ao inicio</a>
              </div>
            ) : (
              <form method="post" action="/contato" class="flex flex-col gap-4">
                <div>
                  <label for="name" class="block text-sm font-semibold text-carvao-700 mb-1">Nome completo *</label>
                  <input id="name" name="name" type="text" required placeholder="Seu nome" class="input w-full" />
                </div>
                <div>
                  <label for="email" class="block text-sm font-semibold text-carvao-700 mb-1">E-mail *</label>
                  <input id="email" name="email" type="email" required placeholder="voce@escritorio.com" class="input w-full" />
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label for="phone" class="block text-sm font-semibold text-carvao-700 mb-1">Telefone</label>
                    <input id="phone" name="phone" type="tel" placeholder="(11) 99999-9999" class="input w-full" />
                  </div>
                  <div>
                    <label for="company" class="block text-sm font-semibold text-carvao-700 mb-1">Escritorio</label>
                    <input id="company" name="company" type="text" placeholder="Nome do escritorio" class="input w-full" />
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label for="role" class="block text-sm font-semibold text-carvao-700 mb-1">Cargo</label>
                    <select id="role" name="role" class="input w-full">
                      <option value="">Selecione</option>
                      <option value="socio">Socio / Socia</option>
                      <option value="advogado">Advogado(a)</option>
                      <option value="gerente">Gerente</option>
                      <option value="ceo">CEO / Diretor(a)</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>
                  <div>
                    <label for="team_size" class="block text-sm font-semibold text-carvao-700 mb-1">Tamanho da equipe</label>
                    <select id="team_size" name="team_size" class="input w-full">
                      <option value="">Selecione</option>
                      <option value="1-5">1-5 pessoas</option>
                      <option value="6-20">6-20 pessoas</option>
                      <option value="21-50">21-50 pessoas</option>
                      <option value="50+">50+ pessoas</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label for="interested_plan" class="block text-sm font-semibold text-carvao-700 mb-1">Plano de interesse</label>
                  <select id="interested_plan" name="interested_plan" class="input w-full">
                    <option value="">Selecione</option>
                    <option value="starter" selected={interestedPlan === "starter"}>Starter — R$ 199/mes</option>
                    <option value="pro" selected={interestedPlan === "pro"}>Pro — R$ 499/mes</option>
                    <option value="enterprise" selected={interestedPlan === "enterprise"}>Enterprise — sob consulta</option>
                    <option value="trial">Ainda nao sei / Trial</option>
                  </select>
                </div>
                <div>
                  <label for="message" class="block text-sm font-semibold text-carvao-700 mb-1">Mensagem (opcional)</label>
                  <textarea id="message" name="message" rows={3} placeholder="Conte-nos sobre seu escritorio e o que procura." class="input w-full"></textarea>
                </div>
                <button type="submit" class="btn btn-primary w-full flex items-center justify-center gap-2">
                  <i class="ph-bold ph-paper-plane-tilt" aria-hidden="true" />
                  Enviar para o comercial
                </button>
                <p class="text-xs text-carvao-400 text-center">Ao enviar, voce concorda com nossa politica de privacidade. Nao compartilhamos seus dados.</p>
              </form>
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
    return c.redirect("/contato");
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
