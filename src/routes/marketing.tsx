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

// ============================================================
// Plan comparison table data
// ============================================================
const COMPARE_ROWS = [
  { label: "Usuários", trial: "3", starter: "3", pro: "10", enterprise: "Ilimitado" },
  { label: "Processos", trial: "25", starter: "500", pro: "Ilimitado", enterprise: "Ilimitado" },
  { label: "IA jurídica (interações/mês)", trial: "50", starter: "50", pro: "300", enterprise: "Sob medida" },
  { label: "Monitoramento DataJud (OAB/CNJ)", trial: "✓", starter: "✓", pro: "✓", enterprise: "✓" },
  { label: "Consultas Legais (créditos/mês)", trial: "3", starter: "15", pro: "50", enterprise: "200" },
  { label: "Site público da advocacia", trial: "✓", starter: "✓", pro: "✓", enterprise: "✓" },
  { label: "Portal do cliente", trial: "✓", starter: "✓", pro: "✓", enterprise: "✓" },
  { label: "Assinaturas digitais (Clicksign)", trial: "✓", starter: "✓", pro: "✓", enterprise: "✓" },
  { label: "Login com Gov.br", trial: "✓", starter: "✓", pro: "✓", enterprise: "✓" },
  { label: "WhatsApp Business integrado", trial: "—", starter: "—", pro: "✓", enterprise: "✓" },
  { label: "API aberta", trial: "—", starter: "—", pro: "✓", enterprise: "✓" },
  { label: "Gestão de equipe e permissões", trial: "—", starter: "—", pro: "✓", enterprise: "✓" },
  { label: "Relatórios e jurimetria", trial: "—", starter: "Básico", pro: "Avançado", enterprise: "Custom" },
  { label: "Suporte", trial: "E-mail", starter: "Prioritário", pro: "Dedicado", enterprise: "24/7 + SLA" },
  { label: "Onboarding personalizado", trial: "—", starter: "—", pro: "—", enterprise: "✓" },
  { label: "Gerente de conta", trial: "—", starter: "—", pro: "—", enterprise: "✓" },
];
// ============================================================
const FEATURES = [
  { icon: "ph-folder-open", title: "Gestão de Processos", desc: "Centralize todos os processos, andamentos e prazos em um só lugar. Robôs monitoram seus processos 24/7 pela OAB ou CNJ via DataJud." },
  { icon: "ph-magnifying-glass", title: "Consultas Legais", desc: "Localize bens, pessoas, empresas e veículos em segundos. 10 tipos de consulta: CPF, CNPJ, placas, débitos veiculares, restrição de crédito e mais. Tudo integrado, com exportação em PDF." },
  { icon: "ph-calendar-check", title: "Prazos e Audiências", desc: "Cálculo automático de prazos, alertas inteligentes e calendário unificado. Nunca mais perca um prazo — o sistema alerta antes que seja tarde." },
  { icon: "ph-currency-dollar", title: "Financeiro Completo", desc: "Honorários, cobranças, fluxo de caixa, relatórios. PIX, boleto, controle de contas trust e lembretes automáticos de pagamento." },
  { icon: "ph-robot", title: "IA Jurídica", desc: "Resumos de processos em 1 clique, pesquisa de jurisprudência em segundos, redação de peças com sua voz e tradução do juridiquês para o cliente." },
  { icon: "ph-whatsapp-logo", title: "WhatsApp Integrado", desc: "Comunique com clientes diretamente da plataforma. Mensagens, arquivos e histórico centralizados — sem trocar de aba." },
  { icon: "ph-signature", title: "Assinaturas Digitais", desc: "Coleta de assinaturas com validade jurídica via Clicksign. Documentos assinados em minutos, sem imprimir nem escanear." },
  { icon: "ph-buildings", title: "Portal do Cliente", desc: "App exclusivo para clientes acompanharem processos, documentos e faturas. Transparência total — seu WhatsApp livre de cobranças." },
  { icon: "ph-chart-line-up", title: "Relatórios e Jurimetria", desc: "Dashboards executivos, análise de performance da equipe e jurimetria preditiva. Decisões com dados, não com achismos." },
  { icon: "ph-users", title: "Gestão de Clientes", desc: "CRM jurídico completo: cadastro, histórico de relacionamento, intake digital e segmentação. Saiba quem é quem em cada processo." },
  { icon: "ph-file-text", title: "Documentos e Petições", desc: "Biblioteca centralizada com versionamento, modelos reutilizáveis e geração automática de petições a partir de dados do processo." },
  { icon: "ph-globe", title: "Site da Advocacia", desc: "Site público profissional incluso — áreas de atuação, equipe, artigos e formulário de contato. SEO otimizado e sem custo extra." },
];

const STATS = [
  { value: "14 dias", label: "teste grátis, sem cartão" },
  { value: "24/7", label: "monitoramento automático de processos" },
  { value: "100%", label: "dados no Brasil — conformidade LGPD" },
  { value: "2 min", label: "para começar — sem instalação" },
];

const TESTIMONIALS = [
  {
    quote: "O monitoramento automático pela OAB mudou minha rotina. Não preciso mais abrir o tribunal todo dia — os andamentos chegam sozinhos.",
    author: "Mariana Costa",
    role: "Advogada autônoma · Cível e família · plano Starter",
    initials: "MC",
    color: "#0568ff",
  },
  {
    quote: "O portal do cliente virou diferencial competitivo. Meus clientes acompanham processos sem me ligar. O WhatsApp ficou livre para o que importa.",
    author: "Rafael Mendes",
    role: "Sócio · Empresarial · 4 advogados · plano Pro",
    initials: "RM",
    color: "#4d8bff",
  },
  {
    quote: "A IA resume andamentos em 1 clique e traduz o juridiquês para o cliente. Economizo pelo menos 2 horas por dia. Só isso já paga a mensalidade.",
    author: "Juliana Alves",
    role: "Advogada · Trabalhista · 8 advogados · plano Pro",
    initials: "JA",
    color: "#2a3a4e",
  },
];

const FAQS = [
  {
    q: "Preciso instalar algo?",
    a: "Não. O PragmaOS é 100% na nuvem — um PWA (Progressive Web App). Você acessa pelo navegador do computador ou celular. Se quiser, pode instalar na tela inicial do celular como um app nativo, sem passar por loja de apps. Funciona até offline.",
  },
  {
    q: "Meus dados estão seguros?",
    a: "Sim. Usamos criptografia AES-256 em repouso e TLS 1.3 em trânsito, autenticação de dois fatores (2FA), login com Gov.br, backup automático diário com retenção de 30 dias e conformidade plena com a LGPD. Seus dados ficam em datacenters no Brasil.",
  },
  {
    q: "Consigo migrar meus processos existentes?",
    a: "Sim. O PragmaOS monitora processos automaticamente via DataJud do CNJ — basta informar sua OAB. Também oferecemos importação em massa (CSV/Excel). No plano Enterprise, nossa equipe faz a migração completa para você.",
  },
  {
    q: "O trial tem alguma limitação?",
    a: "Não. Durante os 14 dias você tem acesso a todos os recursos do plano Pro, sem restrição e sem cartão de crédito. Ao final, escolhe o plano que faz sentido para o seu escritório. Se não escolher, a conta simplesmente expira — sem cobrança automática.",
  },
  {
    q: "Como funciona o cancelamento?",
    a: "Você pode cancelar a qualquer momento, direto na plataforma, sem multa nem fidelidade. O acesso continua até o fim do período já pago. Seus dados ficam disponíveis para exportação por 90 dias após o cancelamento.",
  },
  {
    q: "Vocês atendem escritórios de qualquer tamanho?",
    a: "Sim. Desde advogados solo (plano Starter, R$ 199/mês) até escritórios com dezenas de profissionais (plano Pro, R$ 499/mês) e grandes operações (Enterprise, sob consulta). Os planos são escaláveis — comece pequeno e cresça sem trocar de plataforma.",
  },
  {
    q: "Como funciona a IA jurídica?",
    a: "A IA do PragmaOS entende contexto jurídico brasileiro. Ela resume andamentos de processos em 1 clique, pesquisa jurisprudência por relevância, redige peças com a voz do seu escritório e traduz o juridiquês para uma linguagem que o cliente entende. A franquia mensal varia por plano (50 a 300 interações) e créditos adicionais estão disponíveis como add-on.",
  },
  {
    q: "O PragmaOS funciona no celular?",
    a: "Sim. O PragmaOS é um PWA — funciona em qualquer dispositivo com navegador moderno (Chrome, Safari, Firefox, Edge). No celular, você pode instalar na tela inicial e usar como app nativo, com notificações push de prazos e audiências. Funciona offline para consultas, anotações e documentos.",
  },
  {
    q: "Posso integrar com WhatsApp?",
    a: "Sim. No plano Pro e Enterprise, o WhatsApp Business está integrado — você envia e recebe mensagens de clientes diretamente da plataforma, sem trocar de aba. Histórico, arquivos e conversas ficam centralizados no processo. Os custos de conversas da Meta são repassados ao cliente.",
  },
  {
    q: "Tem assinatura digital?",
    a: "Sim. O PragmaOS tem integração nativa com Clicksign — assinaturas digitais com validade jurídica (ICP-Brasil). Você envia documentos para assinatura diretamente da plataforma e acompanha o status em tempo real. Disponível em todos os planos.",
  },
  {
    q: "O que sao as Consultas Legais?",
    a: "Consultas Legais e um modulo integrado que permite localizar bens, pessoas, empresas e veiculos em segundos. Sao 10 tipos de consulta: localizacao por CPF (enderecos, telefones, e-mails), situacao cadastral na Receita Federal, CNPJ completo com quadro societario, veiculos por CPF/CNPJ, dados de veiculo por placa, debitos veiculares, restricao de credito (Serasa/SPC), relacionamentos societarios, grupo economico e buscador processual. Cada plano inclui creditos mensais (3 no trial, 15 no Starter, 50 no Pro, 200 no Enterprise) e creditos adicionais podem ser comprados como add-on. Todas as consultas podem ser exportadas em PDF e vinculadas a processos.",
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
      {/* Hero — navy cinematic with aurora WebGL background */}
      <section class="gradient-hero-navy text-white relative overflow-hidden">
        <canvas id="aurora-hero" class="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />
        <div class="noise-overlay absolute inset-0 opacity-[0.15] mix-blend-overlay pointer-events-none" />
        <div class="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40 pointer-events-none" />
        <div class="max-w-[1200px] mx-auto px-4 sm:px-6 py-24 md:py-32 lg:py-40 relative">
          <div class="max-w-2xl">
            <h1 class="reveal text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1.05] tracking-[-0.02em] text-balance mb-6">
              A gestão jurídica do seu escritório, <span class="text-white italic font-serif font-normal">finalmente</span> em um só lugar.
            </h1>
            <p class="reveal text-lg md:text-xl text-white/80 text-pretty mb-10 leading-relaxed">
              Processos, prazos, financeiro e IA jurídica — tudo integrado. Comece grátis em 2 minutos.
            </p>
            <div class="reveal flex flex-col sm:flex-row gap-4">
              <a href="/signup" class="group inline-flex items-center justify-center gap-3 bg-white text-[#0568ff] font-semibold text-sm sm:text-base px-6 py-3.5 rounded-full hover:bg-[#4d8bff] transition-all hover:gap-4">
                <i class="ph-bold ph-rocket-launch" aria-hidden="true" />
                Começar teste grátis
                <span class="w-8 h-8 rounded-full bg-[#0568ff] flex items-center justify-center group-hover:scale-110 transition-transform">
                  <i class="ph-bold ph-arrow-right text-white text-sm" aria-hidden="true" />
                </span>
              </a>
              <a href="/contato" class="px-6 py-3.5 rounded-full border border-white/20 text-white font-semibold text-sm sm:text-base hover:bg-white/10 transition inline-flex items-center justify-center gap-2 backdrop-blur-sm">
                <i class="ph ph-calendar-blank" aria-hidden="true" />
                Agendar demonstração
              </a>
            </div>
            <p class="reveal text-sm text-white/60 mt-6">14 dias grátis. Sem cartão. Cancele quando quiser.</p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section class="py-16 bg-[#eef0f5]">
        <div class="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div class="reveal-stagger grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {STATS.map((s) => (
              <div>
                <div class="text-3xl md:text-4xl font-extrabold text-[#232856] stat-counter" data-value={s.value}>{s.value}</div>
                <div class="text-sm text-[#4a5470] mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Segmentação — Para quem é o PragmaOS */}
      <section class="py-20 px-4 sm:px-6 bg-[#f5f6fa]">
        <div class="max-w-[1200px] mx-auto">
          <div class="reveal text-center mb-14">
            <p class="text-xs font-bold text-[#0568ff] uppercase tracking-wider mb-3">Para quem é</p>
            <h2 class="text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#232856] text-balance tracking-[-0.01em] mb-4">
              Do advogado solo ao escritório em crescimento.
            </h2>
            <p class="text-base md:text-lg text-[#4a5470] text-pretty max-w-2xl mx-auto leading-relaxed">
              Planos escaláveis. Comece pequeno e cresça sem trocar de plataforma.
            </p>
          </div>
          <div class="reveal-stagger grid md:grid-cols-3 gap-6">
            <div class="card-lexis p-8">
              <div class="w-12 h-12 rounded-xl bg-[#eef0f5] flex items-center justify-center mb-5">
                <i class="ph-bold ph-user text-2xl text-[#0568ff]" aria-hidden="true" />
              </div>
              <h3 class="text-lg font-bold text-[#232856] mb-2">Advogados solo</h3>
              <p class="text-sm text-[#4a5470] leading-relaxed mb-4">Centralize processos, prazos e financeiro sem contratar secretaria. A IA faz o trabalho repetitivo por você.</p>
              <ul class="space-y-2 text-sm text-[#4a5470]">
                <li class="flex gap-2"><i class="ph ph-check text-[#0568ff] mt-0.5" aria-hidden="true" /> Monitoramento automático pela OAB</li>
                <li class="flex gap-2"><i class="ph ph-check text-[#0568ff] mt-0.5" aria-hidden="true" /> Site público da advocacia incluso</li>
                <li class="flex gap-2"><i class="ph ph-check text-[#0568ff] mt-0.5" aria-hidden="true" /> A partir de R$ 199/mês</li>
              </ul>
            </div>
            <div class="card-lexis p-8 border-2 border-[#4d8bff] bg-[#e6efff]/20 relative">
              <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#4d8bff] text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Mais popular</div>
              <div class="w-12 h-12 rounded-xl bg-[#4d8bff] flex items-center justify-center mb-5">
                <i class="ph-bold ph-users-three text-2xl text-white" aria-hidden="true" />
              </div>
              <h3 class="text-lg font-bold text-[#232856] mb-2">Pequenos escritórios</h3>
              <p class="text-sm text-[#4a5470] leading-relaxed mb-4">Gestão de equipe, permissões, portal do cliente e WhatsApp integrado. Tudo que um escritório de 2 a 10 advogados precisa.</p>
              <ul class="space-y-2 text-sm text-[#4a5470]">
                <li class="flex gap-2"><i class="ph ph-check text-[#0568ff] mt-0.5" aria-hidden="true" /> Até 10 usuários com permissões</li>
                <li class="flex gap-2"><i class="ph ph-check text-[#0568ff] mt-0.5" aria-hidden="true" /> WhatsApp Business integrado</li>
                <li class="flex gap-2"><i class="ph ph-check text-[#0568ff] mt-0.5" aria-hidden="true" /> A partir de R$ 499/mês</li>
              </ul>
            </div>
            <div class="card-lexis p-8">
              <div class="w-12 h-12 rounded-xl bg-[#eef0f5] flex items-center justify-center mb-5">
                <i class="ph-bold ph-building-office text-2xl text-[#0568ff]" aria-hidden="true" />
              </div>
              <h3 class="text-lg font-bold text-[#232856] mb-2">Escritórios em escala</h3>
              <p class="text-sm text-[#4a5470] leading-relaxed mb-4">Onboarding personalizado, SLA 24/7, integrações sob medida e gerente de conta dedicado. Para operações que não podem parar.</p>
              <ul class="space-y-2 text-sm text-[#4a5470]">
                <li class="flex gap-2"><i class="ph ph-check text-[#0568ff] mt-0.5" aria-hidden="true" /> Usuários e processos ilimitados</li>
                <li class="flex gap-2"><i class="ph ph-check text-[#0568ff] mt-0.5" aria-hidden="true" /> API aberta + integrações custom</li>
                <li class="flex gap-2"><i class="ph ph-check text-[#0568ff] mt-0.5" aria-hidden="true" /> Sob consulta</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Problem / solution */}
      <section class="py-20 px-4 sm:px-6 bg-[#f5f6fa]">
        <div class="max-w-[1200px] mx-auto">
          <div class="reveal max-w-3xl mx-auto text-center mb-14">
            <p class="text-xs font-bold text-[#0568ff] uppercase tracking-wider mb-3">O problema</p>
            <h2 class="text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#232856] text-balance mb-6 tracking-[-0.01em]">
              Seu escritório não deveria ser gerido em planilhas.
            </h2>
            <p class="text-base md:text-lg text-[#4a5470] text-pretty max-w-2xl mx-auto leading-relaxed">
              Prazos perdidos em e-mails. Financeiro espalhado em abas. Clientes sem visibilidade. Equipe sem clareza. Cada ferramenta avulsa resolve um pedaço — e cria um novo problema de integração.
            </p>
          </div>

          <div class="reveal-stagger max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
            <div class="rounded-xl border border-[#ffdad6] bg-[#ffdad6]/10 p-8">
              <div class="flex items-center gap-2 mb-6">
                <i class="ph-bold ph-x-circle text-[#ba1a1a] text-xl" aria-hidden="true" />
                <h3 class="font-bold text-[#ba1a1a] text-lg">Sem PragmaOS</h3>
              </div>
              <ul class="space-y-3 text-sm text-[#4a5470]">
                <li class="flex gap-2"><i class="ph ph-x text-[#ba1a1a] mt-0.5" aria-hidden="true" />Prazos rastreados manualmente em planilhas</li>
                <li class="flex gap-2"><i class="ph ph-x text-[#ba1a1a] mt-0.5" aria-hidden="true" />Financeiro separado dos processos</li>
                <li class="flex gap-2"><i class="ph ph-x text-[#ba1a1a] mt-0.5" aria-hidden="true" />Clientes ligando para saber o andamento</li>
                <li class="flex gap-2"><i class="ph ph-x text-[#ba1a1a] mt-0.5" aria-hidden="true" />Sem visão de produtividade da equipe</li>
                <li class="flex gap-2"><i class="ph ph-x text-[#ba1a1a] mt-0.5" aria-hidden="true" />Pesquisa de jurisprudência manual e lenta</li>
              </ul>
            </div>
            <div class="rounded-xl border-2 border-[#4d8bff] bg-white p-8 relative shadow-[0_20px_40px_-15px_rgba(5,17,33,0.06)]">
              <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#4d8bff] text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">A Solução</div>
              <div class="flex items-center gap-2 mb-6">
                <i class="ph-bold ph-check-circle text-[#0568ff] text-xl" aria-hidden="true" />
                <h3 class="font-bold text-[#232856] text-lg">Com PragmaOS</h3>
              </div>
              <ul class="space-y-3 text-sm text-[#4a5470]">
                <li class="flex gap-2"><i class="ph ph-check text-[#0568ff] mt-0.5" aria-hidden="true" />Prazos calculados e alertados automaticamente</li>
                <li class="flex gap-2"><i class="ph ph-check text-[#0568ff] mt-0.5" aria-hidden="true" />Financeiro vinculado a cada processo</li>
                <li class="flex gap-2"><i class="ph ph-check text-[#0568ff] mt-0.5" aria-hidden="true" />Portal do cliente com transparência total</li>
                <li class="flex gap-2"><i class="ph ph-check text-[#0568ff] mt-0.5" aria-hidden="true" />Dashboards de performance em tempo real</li>
                <li class="flex gap-2"><i class="ph ph-check text-[#0568ff] mt-0.5" aria-hidden="true" />IA que resume, pesquisa e redige por você</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section id="recursos" class="py-20 px-4 sm:px-6 bg-[#eef0f5]">
        <div class="max-w-[1200px] mx-auto">
          <div class="reveal text-center mb-14">
            <p class="text-xs font-bold text-[#0568ff] uppercase tracking-wider mb-3">Tudo em um</p>
            <h2 class="text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#232856] text-balance tracking-[-0.01em]">
              Uma plataforma. Tudo que seu escritório precisa.
            </h2>
          </div>
          <div class="reveal-stagger grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f, i) => (
              <div class={`card-lexis p-6 group ${i === 3 ? "border-[#4d8bff] bg-[#e6efff]/30" : ""}`}>
                <div class={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition ${i === 3 ? "bg-[#4d8bff]" : "bg-[#eef0f5] group-hover:bg-[#0568ff]"}`}>
                  <i class={`ph-bold ${f.icon} text-2xl ${i === 3 ? "text-white" : "text-[#0568ff] group-hover:text-white"} transition`} aria-hidden="true" />
                </div>
                {i === 3 && <div class="inline-block bg-[#4d8bff] text-white text-[10px] px-2 py-0.5 rounded-full uppercase font-bold mb-2">Novo</div>}
                <h3 class="font-bold text-[#232856] mb-2 text-base">{f.title}</h3>
                <p class="text-sm text-[#4a5470] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI highlight — minimalista */}
      <section class="py-24 px-4 sm:px-6">
        <div class="max-w-3xl mx-auto text-center">
          <div class="reveal inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#e6efff] text-[#0568ff] text-xs font-bold uppercase tracking-wider mb-6">
            <i class="ph-fill ph-sparkle" aria-hidden="true" /> IA Jurídica
          </div>
          <h2 class="reveal text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#232856] mb-5 text-balance tracking-[-0.01em]">
            Menos trabalho manual. Mais tempo para o que importa.
          </h2>
          <p class="reveal text-base md:text-lg text-[#4a5470] text-pretty mb-12 leading-relaxed">
            A IA do PragmaOS entende o contexto jurídico brasileiro. Resume processos, pesquisa jurisprudência, redige peças e traduz o juridiquês para o cliente — tudo dentro da plataforma.
          </p>
          <div class="reveal-stagger grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-2xl mx-auto">
            <div class="flex items-start gap-3 p-4 rounded-xl border border-[#dce0e8] bg-white">
              <i class="ph ph-scroll text-xl text-[#0568ff] mt-0.5" aria-hidden="true" />
              <div>
                <p class="font-semibold text-sm text-[#232856]">Resumo de andamentos</p>
                <p class="text-sm text-[#7a82a0]">Síntese em 1 clique com riscos e próximos passos</p>
              </div>
            </div>
            <div class="flex items-start gap-3 p-4 rounded-xl border border-[#dce0e8] bg-white">
              <i class="ph ph-gavel text-xl text-[#0568ff] mt-0.5" aria-hidden="true" />
              <div>
                <p class="font-semibold text-sm text-[#232856]">Pesquisa de jurisprudência</p>
                <p class="text-sm text-[#7a82a0]">Decisões relevantes encontradas em segundos</p>
              </div>
            </div>
            <div class="flex items-start gap-3 p-4 rounded-xl border border-[#dce0e8] bg-white">
              <i class="ph ph-pen-nib text-xl text-[#0568ff] mt-0.5" aria-hidden="true" />
              <div>
                <p class="font-semibold text-sm text-[#232856]">Redação assistida</p>
                <p class="text-sm text-[#7a82a0]">Peças com sua voz e estilo, prontas para revisar</p>
              </div>
            </div>
            <div class="flex items-start gap-3 p-4 rounded-xl border border-[#dce0e8] bg-white">
              <i class="ph ph-translate text-xl text-[#0568ff] mt-0.5" aria-hidden="true" />
              <div>
                <p class="font-semibold text-sm text-[#232856]">Tradução do juridiquês</p>
                <p class="text-sm text-[#7a82a0]">Linguagem simples para o cliente entender</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Consultas Legais — localização de bens e pessoas */}
      <section id="consultas" class="py-20 px-4 sm:px-6">
        <div class="max-w-5xl mx-auto">
          <div class="text-center mb-12">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0568ff] text-white text-xs sm:text-sm mb-5">
              <i class="ph-bold ph-magnifying-glass" aria-hidden="true" /> Consultas Legais
            </div>
            <h2 class="reveal text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#232856] mb-4 text-balance tracking-[-0.01em]">
              Localize bens, pessoas e empresas em segundos.
            </h2>
            <p class="reveal text-[#4a5470] max-w-2xl mx-auto text-pretty leading-relaxed">
              10 tipos de consulta integrados — encontre veículos para penhora, localize devedores, analise a parte contrária e verifique restrições de crédito. Tudo sem sair da plataforma, com exportação em PDF.
            </p>
          </div>

          <div class="reveal-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: "ph-map-pin", title: "Localização por CPF", desc: "Nome, endereços, telefones e e-mails" },
              { icon: "ph-fingerprint", title: "Situação Cadastral CPF", desc: "Status na Receita + verificação de óbito" },
              { icon: "ph-building", title: "CNPJ Completo", desc: "Dados da empresa + quadro societário (QSA)" },
              { icon: "ph-car", title: "Veículos por CPF/CNPJ", desc: "Todos os veículos em nome de uma pessoa" },
              { icon: "ph-car-profile", title: "Dados do Veículo por Placa", desc: "Proprietário, RENAVAM e restrições" },
              { icon: "ph-traffic-cone", title: "Débitos Veiculares", desc: "Multas, IPVA e status de licenciamento" },
              { icon: "ph-credit-card", title: "Restrição de Crédito", desc: "Serasa/SPC e indicadores de risco" },
              { icon: "ph-users-three", title: "Relacionamentos", desc: "Vínculos entre pessoas e empresas" },
              { icon: "ph-buildings", title: "Grupo Econômico", desc: "Relações entre empresas do mesmo grupo" },
              { icon: "ph-scales", title: "Buscador Processual", desc: "Processos judiciais por CPF/CNPJ" },
            ].map((c) => (
              <div class="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition">
                <div class="flex items-start gap-3">
                  <div class="w-10 h-10 rounded-lg bg-[#0568ff] flex items-center justify-center flex-shrink-0">
                    <i class={`ph-bold ${c.icon} text-white text-lg`} aria-hidden="true" />
                  </div>
                  <div>
                    <div class="font-semibold text-[#232856] text-sm">{c.title}</div>
                    <div class="text-xs text-[#7a82a0] mt-0.5">{c.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div class="reveal text-center mt-8">
            <p class="text-sm text-[#7a82a0] mb-4">
              Créditos mensais inclusos: <strong class="text-[#0568ff]">3</strong> (trial) · <strong class="text-[#0568ff]">15</strong> (Starter) · <strong class="text-[#0568ff]">50</strong> (Pro) · <strong class="text-[#0568ff]">200</strong> (Enterprise). Créditos adicionais como add-on.
            </p>
            <a href="/signup" class="inline-flex items-center gap-2 bg-[#0568ff] text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-[#4d8bff] transition">
              <i class="ph-bold ph-rocket-launch" aria-hidden="true" /> Experimentar grátis
            </a>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section id="integracoes" class="py-20 px-4 sm:px-6 bg-[#eef0f5]">
        <div class="max-w-5xl mx-auto text-center">
          <p class="reveal text-xs font-bold text-[#0568ff] uppercase tracking-wider mb-3">Integrações nativas</p>
          <h2 class="reveal text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#232856] mb-4 text-balance tracking-[-0.01em]">
            Conectado ao que já importa para você.
          </h2>
          <p class="reveal text-[#4a5470] mb-12 max-w-2xl mx-auto">Dados que antes exigiam cópia manual, agora sincronizados automaticamente.</p>
          <div class="reveal-stagger grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <div class="card-lexis p-5 flex flex-col items-center gap-2">
                <i class={`ph-bold ${i.icon} text-3xl text-[#0568ff]`} aria-hidden="true" />
                <span class="text-sm font-semibold text-[#4a5470]">{i.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="depoimentos" class="py-20 px-4 sm:px-6 bg-[#f5f6fa]">
        <div class="max-w-5xl mx-auto">
          <div class="reveal text-center mb-14">
            <p class="text-xs font-bold text-[#0568ff] uppercase tracking-wider mb-3">Quem usa, recomenda</p>
            <h2 class="text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#232856] text-balance tracking-[-0.01em]">
              Escritórios que transformaram sua operação.
            </h2>
          </div>
          <div class="reveal-stagger grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <figure class="card-lexis p-6 flex flex-col">
                <div class="flex gap-0.5 text-[#0568ff] mb-4">
                  {[1, 2, 3, 4, 5].map(() => <i class="ph-fill ph-star" aria-hidden="true" />)}
                </div>
                <blockquote class="text-[#232856] text-pretty mb-6 leading-relaxed text-sm flex-1">"{t.quote}"</blockquote>
                <figcaption class="flex items-center gap-3 pt-4 border-t border-[#dce0e8]">
                  <div
                    class="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={`background:${t.color}`}
                  >
                    {t.initials}
                  </div>
                  <div>
                    <div class="font-bold text-[#232856] text-sm">{t.author}</div>
                    <div class="text-xs text-[#7a82a0]">{t.role}</div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="planos" class="py-20 px-4 sm:px-6 bg-[#eef0f5]">
        <div class="max-w-[1200px] mx-auto">
          <div class="reveal text-center mb-14">
            <p class="text-xs font-bold text-[#0568ff] uppercase tracking-wider mb-3">Planos</p>
            <h2 class="text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#232856] mb-4 text-balance tracking-[-0.01em]">
              Preço justo. Sem surpresas.
            </h2>
            <p class="text-[#4a5470]">Escolha o plano ideal para o momento do seu escritório.</p>
          </div>
          <div class="reveal-stagger grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS.map((p) => (
              <div class={`rounded-xl p-6 flex flex-col transition-all duration-300 hover:-translate-y-1 ${p.highlight ? "bg-[#0568ff] text-white border-2 border-[#4d8bff] shadow-[0_20px_40px_-15px_rgba(5,17,33,0.15)] scale-[1.02]" : "card-lexis"}`}>
                {p.highlight && (
                  <div class="inline-flex self-start items-center gap-1 px-2.5 py-1 rounded-full bg-white text-[#0568ff] text-xs font-bold mb-3">
                    <i class="ph-fill ph-star" aria-hidden="true" /> Mais popular
                  </div>
                )}
                <h3 class={`text-lg font-extrabold mb-1 ${p.highlight ? "text-white" : "text-[#0568ff]"}`}>{p.name}</h3>
                <p class={`text-sm mb-4 ${p.highlight ? "text-white/80" : "text-[#7a82a0]"}`}>{p.tagline}</p>
                <div class="mb-5">
                  <span class={`text-3xl font-extrabold ${p.highlight ? "text-white" : "text-[#0568ff]"}`}>{p.price}</span>
                  {p.period && <span class={`text-sm ${p.highlight ? "text-white/70" : "text-[#7a82a0]"}`}>{p.period}</span>}
                </div>
                <ul class="space-y-2.5 text-sm mb-6 flex-1">
                  {p.features.map((f) => (
                    <li class="flex gap-2">
                      <i class={`ph-fill ph-check-circle mt-0.5 ${p.highlight ? "text-white" : "text-[#0568ff]"}`} aria-hidden="true" />
                      <span class={p.highlight ? "text-white/90" : "text-[#4a5470]"}>{f}</span>
                    </li>
                  ))}
                </ul>
                {p.footnote && (
                  <p class={`text-xs mb-4 ${p.highlight ? "text-white/70" : "text-[#7a82a0]"}`}>{p.footnote}</p>
                )}
                <a
                  href={p.href}
                  class={`text-center py-2.5 rounded-lg font-semibold text-sm transition ${p.highlight ? "bg-white text-[#0568ff] hover:bg-[#4d8bff] hover:text-white" : "border border-[#c5cad6] text-[#0568ff] hover:border-[#0568ff] hover:bg-[#eef0f5]"}`}
                >
                  {p.cta}
                </a>
              </div>
            ))}
          </div>
          <p class="reveal text-center text-sm text-[#7a82a0] mt-8">
            Todos os planos incluem: criptografia, backup diário, suporte e atualizações gratuitas. Créditos adicionais de IA disponíveis como add-on.
          </p>

          {/* Comparison table */}
          <div class="reveal mt-12 overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="border-b-2 border-[#c5cad6]">
                  <th class="text-left py-4 px-4 font-bold text-[#232856]">Recurso</th>
                  <th class="text-center py-4 px-3 font-bold text-[#4a5470]">Trial</th>
                  <th class="text-center py-4 px-3 font-bold text-[#4a5470]">Starter</th>
                  <th class="text-center py-4 px-3 font-bold text-white bg-[#0568ff] rounded-t-lg">Pro</th>
                  <th class="text-center py-4 px-3 font-bold text-[#4a5470]">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row, i) => (
                  <tr class={i % 2 === 0 ? "bg-[#f5f6fa]" : "bg-white"}>
                    <td class="py-3 px-4 font-medium text-[#232856]">{row.label}</td>
                    <td class="text-center py-3 px-3 text-[#4a5470]">{row.trial}</td>
                    <td class="text-center py-3 px-3 text-[#4a5470]">{row.starter}</td>
                    <td class="text-center py-3 px-3 text-[#0568ff] font-semibold bg-[#e6efff]/20">{row.pro}</td>
                    <td class="text-center py-3 px-3 text-[#4a5470]">{row.enterprise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="seguranca" class="py-20 px-4 sm:px-6 bg-[#f5f6fa]">
        <div class="max-w-3xl mx-auto">
          <div class="reveal">
            <div class="w-14 h-14 rounded-2xl bg-[#0568ff] flex items-center justify-center mb-5">
              <i class="ph-bold ph-shield-check text-3xl text-white" aria-hidden="true" />
            </div>
            <h2 class="text-3xl md:text-4xl font-extrabold text-[#232856] mb-4 text-balance tracking-[-0.01em]">
              Segurança de nível bancário. Conformidade com a LGPD.
            </h2>
            <p class="text-[#4a5470] mb-6 text-pretty leading-relaxed">
              Seus dados são o seu negócio. Por isso tratamos segurança como prioridade absoluta — não como recurso.
            </p>
            <ul class="space-y-3 text-sm">
              <li class="flex items-center gap-3"><i class="ph-bold ph-lock-key text-[#0568ff] text-lg" aria-hidden="true" /><span class="text-[#4a5470]">Criptografia AES-256 em repouso e TLS 1.3 em trânsito</span></li>
              <li class="flex items-center gap-3"><i class="ph-bold ph-user-circle-check text-[#0568ff] text-lg" aria-hidden="true" /><span class="text-[#4a5470]">Autenticação de dois fatores (2FA) e login com Gov.br</span></li>
              <li class="flex items-center gap-3"><i class="ph-bold ph-database text-[#0568ff] text-lg" aria-hidden="true" /><span class="text-[#4a5470]">Backup automático diário com retenção de 30 dias</span></li>
              <li class="flex items-center gap-3"><i class="ph-bold ph-map-pin text-[#0568ff] text-lg" aria-hidden="true" /><span class="text-[#4a5470]">Dados hospedados em datacenters no Brasil</span></li>
              <li class="flex items-center gap-3"><i class="ph-bold ph-file-text text-[#0568ff] text-lg" aria-hidden="true" /><span class="text-[#4a5470]">Conformidade plena com a LGPD</span></li>
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" class="py-20 px-4 sm:px-6 bg-[#eef0f5]">
        <div class="max-w-3xl mx-auto">
          <div class="reveal text-center mb-12">
            <p class="text-xs font-bold text-[#0568ff] uppercase tracking-wider mb-3">Dúvidas frequentes</p>
            <h2 class="text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#232856] text-balance tracking-[-0.01em]">
              Tudo que você precisa saber.
            </h2>
          </div>
          <div class="reveal-stagger space-y-3" {...{ "x-data": "{ open: 0 }" }}>
            {FAQS.map((f, i) => (
              <div class="bg-white rounded-xl border border-[#dce0e8] overflow-hidden">
                <button
                  class="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                  {...{ "@click": `open = open === ${i + 1} ? 0 : ${i + 1}` }}
                >
                  <span class="font-bold text-[#232856]">{f.q}</span>
                  <i class="ph ph-caret-down text-[#0568ff] transition-transform" {...{ ":class": `open === ${i + 1} ? 'rotate-180' : ''` }} aria-hidden="true" />
                </button>
                <div {...{ "x-show": `open === ${i + 1}` }} x-cloak {...{ "x-transition": "" }} class="px-5 pb-4 text-sm text-[#4a5470] leading-relaxed">
                  {f.a}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section class="gradient-hero-navy text-white py-20 px-4 sm:px-6 relative overflow-hidden">
        <div class="noise-overlay absolute inset-0 opacity-[0.15] mix-blend-overlay pointer-events-none" />
        <div class="max-w-3xl mx-auto text-center relative">
          <h2 class="reveal text-3xl md:text-5xl font-extrabold mb-5 text-balance tracking-[-0.02em]">
            Pronto para transformar seu escritório?
          </h2>
          <p class="reveal text-base md:text-lg text-white/80 mb-8 text-pretty">
            Comece hoje. 14 dias grátis, sem cartão de crédito. Em 2 minutos você está dentro.
          </p>
          <div class="reveal flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/signup" class="group inline-flex items-center justify-center gap-3 bg-white text-[#0568ff] font-semibold text-sm sm:text-base px-6 py-3.5 rounded-full hover:bg-[#4d8bff] transition-all hover:gap-4">
              <i class="ph-bold ph-rocket-launch" aria-hidden="true" />
              Criar conta grátis
              <span class="w-8 h-8 rounded-full bg-[#0568ff] flex items-center justify-center group-hover:scale-110 transition-transform">
                <i class="ph-bold ph-arrow-right text-white text-sm" aria-hidden="true" />
              </span>
            </a>
            <a href="/contato" class="px-6 py-3.5 rounded-full border border-white/20 text-white font-semibold text-sm sm:text-base hover:bg-white/10 transition inline-flex items-center justify-center gap-2 backdrop-blur-sm">
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
      <section class="py-20 px-4 sm:px-6 bg-[#f5f6fa]">
        <div class="max-w-3xl mx-auto">
          <h1 class="reveal text-4xl md:text-5xl font-extrabold text-[#232856] mb-6 text-balance tracking-[-0.02em]">Construído por quem entende o jurídico brasileiro.</h1>
          <p class="reveal text-lg text-[#4a5470] mb-8 text-pretty leading-relaxed">
            O PragmaOS nasceu de uma frustração simples: escritórios de advocacia no Brasil operavam com ferramentas pensadas para outros setores — ou pior, com planilhas. Prazos se perdiam, o financeiro vivia desconectado dos processos, e a equipe gastava horas em tarefas que a tecnologia já conseguia resolver.
          </p>
          <p class="reveal text-lg text-[#4a5470] mb-8 text-pretty leading-relaxed">
            Nossa missão é clara: devolver tempo aos advogados. Cada feature do PragmaOS existe para eliminar uma fricção real, vivida por escritórios reais. Não construímos para o mercado global — construímos para o Brasil, com DataJud, OAB, LGPD e a realidade do foro brasileiro no DNA.
          </p>
          <div class="reveal-stagger grid grid-cols-3 gap-6 my-12 text-center">
            <div>
              <div class="text-3xl font-extrabold text-[#0568ff]">2024</div>
              <div class="text-sm text-[#7a82a0]">Fundação</div>
            </div>
            <div>
              <div class="text-3xl font-extrabold text-[#0568ff]">LGPD</div>
              <div class="text-sm text-[#7a82a0]">Conformidade total</div>
            </div>
            <div>
              <div class="text-3xl font-extrabold text-[#0568ff]">BR</div>
              <div class="text-sm text-[#7a82a0]">100% nacional</div>
            </div>
          </div>
          <h2 class="reveal text-2xl font-extrabold text-[#232856] mb-4">Nossos valores</h2>
          <ul class="reveal-stagger space-y-4 text-[#4a5470]">
            <li class="flex gap-3"><i class="ph-bold ph-target text-[#0568ff] text-xl mt-0.5" aria-hidden="true" /><div><strong>Tempo é o ativo mais valioso.</strong> Tudo que automatizamos é tempo que devolvemos ao advogado para o que importa: estratégia e relacionamento.</div></li>
            <li class="flex gap-3"><i class="ph-bold ph-shield-check text-[#0568ff] text-xl mt-0.5" aria-hidden="true" /><div><strong>Segurança não é negociável.</strong> Dados jurídicos são sensíveis. Tratamos cada byte como se fosse nosso.</div></li>
            <li class="flex gap-3"><i class="ph-bold ph-flag-banner text-[#0568ff] text-xl mt-0.5" aria-hidden="true" /><div><strong>Feito para o Brasil.</strong> Não adaptamos um produto gringo. Construímos do zero para a realidade do foro brasileiro.</div></li>
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
      <section class="py-16 md:py-24 px-4 sm:px-6 bg-[#f5f6fa]">
        <div class="max-w-5xl mx-auto grid md:grid-cols-2 gap-12">
          {/* Copy side */}
          <div>
            <h1 class="reveal text-3xl md:text-4xl font-extrabold text-[#232856] mb-5 text-balance tracking-[-0.01em]">
              Vamos conversar sobre o seu escritório.
            </h1>
            <p class="reveal text-lg text-[#4a5470] mb-8 text-pretty leading-relaxed">
              Preencha o formulário e nosso time comercial entra em contato em até 1 dia útil. Para o plano Enterprise, agendamos uma demonstração personalizada.
            </p>
            <div class="reveal-stagger space-y-4">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg bg-[#eef0f5] flex items-center justify-center shrink-0">
                  <i class="ph-bold ph-envelope text-[#0568ff]" aria-hidden="true" />
                </div>
                <div>
                  <div class="font-bold text-[#232856] text-sm">E-mail comercial</div>
                  <a href="mailto:comercial@pragmaos.com.br" class="text-sm text-[#0568ff] hover:underline">comercial@pragmaos.com.br</a>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg bg-[#eef0f5] flex items-center justify-center shrink-0">
                  <i class="ph-bold ph-whatsapp-logo text-[#0568ff]" aria-hidden="true" />
                </div>
                <div>
                  <div class="font-bold text-[#232856] text-sm">WhatsApp</div>
                  <a href="https://wa.me/5535984641515" class="text-sm text-[#0568ff] hover:underline">+55 (35) 98464-1515</a>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg bg-[#eef0f5] flex items-center justify-center shrink-0">
                  <i class="ph-bold ph-clock text-[#0568ff]" aria-hidden="true" />
                </div>
                <div>
                  <div class="font-bold text-[#232856] text-sm">Tempo de resposta</div>
                  <span class="text-sm text-[#4a5470]">Até 1 dia útil</span>
                </div>
              </div>
            </div>
          </div>

          {/* Form side */}
          <div class="reveal bg-[#eef0f5] rounded-2xl p-6 md:p-8 border border-[#dce0e8]">
            {success ? (
              <div class="text-center py-10">
                <div class="w-16 h-16 rounded-full bg-[#e6efff] flex items-center justify-center mx-auto mb-4">
                  <i class="ph-bold ph-check-circle text-3xl text-[#0568ff]" aria-hidden="true" />
                </div>
                <h2 class="text-xl font-extrabold text-[#232856] mb-2">Recebemos seu contato!</h2>
                <p class="text-sm text-[#4a5470] mb-6">Nosso time comercial entrará em contato em breve. Obrigado pelo interesse.</p>
                <a href="/" class="inline-flex items-center gap-2 px-4 py-2 border border-[#c5cad6] rounded-lg text-sm font-semibold text-[#0568ff] hover:bg-white transition">Voltar ao início</a>
              </div>
            ) : (
              <>
                {error && (
                  <div class="bg-[#ffdad6] border border-[#ba1a1a] text-[#ba1a1a] px-4 py-3 rounded-lg mb-4 text-sm">
                    {decodeURIComponent(error).replace(/</g, "&lt;").replace(/>/g, "&gt;")}
                  </div>
                )}
                <form method="post" action="/contato" class="flex flex-col gap-4">
                <div>
                  <label for="name" class="block text-sm font-bold text-[#0568ff] mb-1">Nome completo *</label>
                  <input id="name" name="name" type="text" required placeholder="Seu nome" value={pref("name")} class="input w-full" />
                </div>
                <div>
                  <label for="email" class="block text-sm font-bold text-[#0568ff] mb-1">E-mail *</label>
                  <input id="email" name="email" type="email" required placeholder="voce@escritorio.com" value={pref("email")} class="input w-full" />
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label for="phone" class="block text-sm font-bold text-[#0568ff] mb-1">Telefone</label>
                    <input id="phone" name="phone" type="tel" placeholder="(35) 98464-1515" value={pref("phone")} class="input w-full" />
                  </div>
                  <div>
                    <label for="company" class="block text-sm font-bold text-[#0568ff] mb-1">Escritório</label>
                    <input id="company" name="company" type="text" placeholder="Nome do escritório" value={pref("company")} class="input w-full" />
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label for="role" class="block text-sm font-bold text-[#0568ff] mb-1">Cargo</label>
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
                    <label for="team_size" class="block text-sm font-bold text-[#0568ff] mb-1">Tamanho da equipe</label>
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
                  <label for="interested_plan" class="block text-sm font-bold text-[#0568ff] mb-1">Plano de interesse</label>
                  <select id="interested_plan" name="interested_plan" class="input w-full">
                    <option value="">Selecione</option>
                    <option value="starter" selected={interestedPlan === "starter"}>Starter — R$ 199/mês</option>
                    <option value="pro" selected={interestedPlan === "pro"}>Pro — R$ 499/mês</option>
                    <option value="enterprise" selected={interestedPlan === "enterprise"}>Enterprise — sob consulta</option>
                    <option value="trial" selected={interestedPlan === "trial"}>Ainda não sei / Trial</option>
                  </select>
                </div>
                <div>
                  <label for="message" class="block text-sm font-bold text-[#0568ff] mb-1">Mensagem (opcional)</label>
                  <textarea id="message" name="message" rows={3} placeholder="Conte-nos sobre seu escritório e o que procura." class="input w-full">{pref("message")}</textarea>
                </div>
                <button type="submit" class="bg-[#0568ff] text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-[#4d8bff] transition flex items-center justify-center gap-2">
                  <i class="ph-bold ph-paper-plane-tilt" aria-hidden="true" />
                  Enviar para o comercial
                </button>
                <p class="text-xs text-[#7a82a0] text-center">Ao enviar, você concorda com nossa política de privacidade. Não compartilhamos seus dados.</p>
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
    { loc: "https://pragmaos.app/termos", priority: "0.3", changefreq: "yearly" },
    { loc: "https://pragmaos.app/privacidade", priority: "0.3", changefreq: "yearly" },
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

// ============================================================
// GET /termos — Terms of Use (SaaS)
// ============================================================
marketingRoutes.get("/termos", (c) => {
  return c.html(
    <MarketingLayout title="Termos de Uso — PragmaOS" active="" description="Termos de uso da plataforma PragmaOS.">
      <div class="max-w-3xl mx-auto px-4 py-16">
        <h1 class="text-4xl font-serif font-bold text-gray-800 mb-2">Termos de Uso</h1>
        <p class="text-sm text-gray-500 mb-8">Última atualização: 02 de agosto de 2026</p>

        <div class="prose prose-lg max-w-none text-gray-700 space-y-6">
          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">1. Aceitação dos Termos</h2>
            <p>Ao criar uma conta ou utilizar a plataforma PragmaOS ("Serviço"), você concorda com estes Termos de Uso. Se não concordar, não utilize o Serviço.</p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">2. Descrição do Serviço</h2>
            <p>O PragmaOS é uma plataforma SaaS de gestão jurídica para escritórios de advocacia, incluindo gestão de processos, prazos, financeiro, IA jurídica e site público white-label.</p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">3. Conta e Responsabilidade</h2>
            <p>Você é responsável pela precisão dos dados fornecidos no cadastro e pela segurança de suas credenciais. A conta é pessoal e intransferível, vinculada ao escritório cadastrado.</p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">4. Uso Aceitável</h2>
            <p>Você concorda em não: (a) usar o Serviço para fins ilegais; (b) tentar acessar dados de outros escritórios; (c) fazer engenharia reversa ou descompilar o software; (d) usar bots ou scripts que sobrecarreguem a infraestrutura.</p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">5. Planos e Pagamentos</h2>
            <p>Oferecemos um período de trial gratuito de 14 dias. Após o trial, a assinatura do plano escolhido é cobrada mensal ou anualmente. Cancelamentos são processados conforme nossa política de reembolso. Preços podem ser alterados com aviso prévio de 30 dias.</p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">6. Dados e Privacidade</h2>
            <p>Seus dados são tratados conforme nossa <a href="/privacidade" class="text-terracota-600 hover:underline">Política de Privacidade</a> e a LGPD (Lei 13.709/2018). Você é titular dos dados inseridos no Serviço e pode solicitá-los ou excluí-los a qualquer momento.</p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">7. Disponibilidade do Serviço</h2>
            <p>Esforçamo-nos para manter 99,9% de uptime, mas não garantimos que o Serviço será ininterrupto ou livre de erros. Manutenções programadas são comunicadas com antecedência.</p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">8. Limitação de Responsabilidade</h2>
            <p>O PragmaOS não se responsabiliza por decisões jurídicas tomadas com base em sugestões de IA, sendo estas apenas ferramentas de apoio. A responsabilidade total é limitada ao valor pago nos últimos 12 meses.</p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">9. Cancelamento</h2>
            <p>Você pode cancelar a assinatura a qualquer momento na área de Assinatura. O acesso continua até o fim do período já pago.</p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">10. Alterações dos Termos</h2>
            <p>Estes termos podem ser atualizados periodicamente. Alterações significativas serão comunicadas por e-mail com 30 dias de antecedência.</p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">11. Contato</h2>
            <p>Em caso de dúvidas: <a href="mailto:contato@pragmaos.com.br" class="text-terracota-600 hover:underline">contato@pragmaos.com.br</a></p>
          </section>
        </div>

        <div class="mt-12 pt-8 border-t border-gray-200">
          <a href="/signup" class="btn btn-primary inline-flex items-center gap-2">Criar conta grátis <i class="ph-bold ph-arrow-right" aria-hidden="true" /></a>
        </div>
      </div>
    </MarketingLayout>,
  );
});

// ============================================================
// GET /privacidade — Privacy Policy (SaaS / LGPD)
// ============================================================
marketingRoutes.get("/privacidade", (c) => {
  return c.html(
    <MarketingLayout title="Política de Privacidade — PragmaOS" active="" description="Política de privacidade e proteção de dados da plataforma PragmaOS (LGPD).">
      <div class="max-w-3xl mx-auto px-4 py-16">
        <h1 class="text-4xl font-serif font-bold text-gray-800 mb-2">Política de Privacidade</h1>
        <p class="text-sm text-gray-500 mb-8">Última atualização: 02 de agosto de 2026</p>

        <div class="prose prose-lg max-w-none text-gray-700 space-y-6">
          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">1. Introdução</h2>
            <p>A PragmaOS ("nós", "nosso") respeita sua privacidade e está comprometida em proteger seus dados pessoais em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).</p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">2. Dados Coletados</h2>
            <p>Coletamos os seguintes dados:</p>
            <ul class="list-disc pl-6 space-y-1">
              <li><strong>Cadastro:</strong> nome, e-mail, telefone, nome do escritório</li>
              <li><strong>Uso da plataforma:</strong> processos, clientes, documentos, prazos inseridos pelo escritório</li>
              <li><strong>Navegação:</strong> cookies essenciais, endereço IP, logs de acesso</li>
              <li><strong>Pagamento:</strong> processados pelo Asaas (não armazenamos dados de cartão)</li>
            </ul>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">3. Finalidade do Tratamento</h2>
            <p>Seus dados são utilizados para:</p>
            <ul class="list-disc pl-6 space-y-1">
              <li>Fornecer e manter o Serviço</li>
              <li>Processar pagamentos e emitir notas fiscais</li>
              <li>Enviar comunicações sobre o serviço e atualizações</li>
              <li>Cumprir obrigações legais e regulatórias</li>
              <li>Melhorar a plataforma através de métricas de uso anônimas</li>
            </ul>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">4. Base Legal</h2>
            <p>O tratamento de dados ocorre com base no consentimento, execução de contrato e cumprimento de obrigações legais.</p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">5. Compartilhamento de Dados</h2>
            <p>Não vendemos seus dados. Compartilhamos dados apenas com:</p>
            <ul class="list-disc pl-6 space-y-1">
              <li><strong>Asaas:</strong> processamento de pagamentos</li>
              <li><strong>Supabase:</strong> infraestrutura de banco de dados</li>
              <li><strong>CNJ DataJud:</strong> consulta de processos (dados públicos)</li>
              <li><strong>Autoridades legais:</strong> quando exigido por ordem judicial</li>
            </ul>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">6. Seus Direitos (LGPD)</h2>
            <p>Você tem direito a: confirmar a existência de tratamento, acessar os dados, corrigi-los, anonimizá-los, bloqueá-los, eliminá-los, portar os dados, revogar consentimento e opor-se ao tratamento.</p>
            <p>Para exercer seus direitos, envie e-mail para <a href="mailto:contato@pragmaos.com.br" class="text-terracota-600 hover:underline">contato@pragmaos.com.br</a>.</p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">7. Segurança</h2>
            <p>Utilizamos criptografia em trânsito (TLS/SSL), isolamento de dados por tenant, backups criptografados e controle de acesso baseado em funções (RBAC).</p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">8. Retenção de Dados</h2>
            <p>Os dados são mantidos enquanto a conta estiver ativa. Após cancelamento, os dados são retidos por 90 dias para exportação e depois permanentemente excluídos, salvo obrigação legal de retenção.</p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">9. Cookies</h2>
            <p>Usamos apenas cookies essenciais para funcionamento (sessão de autenticação). Não usamos cookies de rastreamento de terceiros para publicidade.</p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">10. Encarregado de Dados (DPO)</h2>
            <p>Para questões de privacidade: <a href="mailto:contato@pragmaos.com.br" class="text-terracota-600 hover:underline">contato@pragmaos.com.br</a></p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">11. Alterações desta Política</h2>
            <p>Esta política pode ser atualizada periodicamente. Alterações significativas serão comunicadas por e-mail.</p>
          </section>
        </div>

        <div class="mt-12 pt-8 border-t border-gray-200">
          <a href="/termos" class="text-terracota-600 hover:underline">Ver Termos de Uso →</a>
        </div>
      </div>
    </MarketingLayout>,
  );
});
