// Cálculo de prazos processuais brasileiros (CPC/2015)
// Considera: feriados nacionais, recesso forense, finais de semana.
// Para feriados estaduais/municipais, o usuário pode fornecer datas adicionais.

// ============================================================
// Feriados nacionais (Lei 10.608/2002 + Lei 13.802/2019)
// ============================================================

function isAnoNovo(d: Date): boolean { return d.getMonth() === 0 && d.getDate() === 1; }
function isTiradentes(d: Date): boolean { return d.getMonth() === 3 && d.getDate() === 21; }
function isTrabalho(d: Date): boolean { return d.getMonth() === 4 && d.getDate() === 1; }
function isIndependencia(d: Date): boolean { return d.getMonth() === 8 && d.getDate() === 7; }
function isNossaSenhora(d: Date): boolean { return d.getMonth() === 9 && d.getDate() === 12; }
function isFinados(d: Date): boolean { return d.getMonth() === 10 && d.getDate() === 2; }
function isProclamacao(d: Date): boolean { return d.getMonth() === 10 && d.getDate() === 15; }
// Consciência Negra: 20 de novembro (Lei 14.759/2023 — feriado nacional)
function isConscienciaNegra(d: Date): boolean { return d.getMonth() === 10 && d.getDate() === 20; }
function isNatal(d: Date): boolean { return d.getMonth() === 11 && d.getDate() === 25; }

// Sexta-feira santa (móvel — calculada via Páscoa)
function pascoa(year: number): Date {
  // Algoritmo de Gauss para Páscoa
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function isSextaSanta(d: Date): boolean {
  const pascoaDate = pascoa(d.getFullYear());
  const sexta = new Date(pascoaDate);
  sexta.setDate(pascoaDate.getDate() - 2);
  return d.getDate() === sexta.getDate() && d.getMonth() === sexta.getMonth() && d.getFullYear() === sexta.getFullYear();
}

function isCarnaval(d: Date): boolean {
  const pascoaDate = pascoa(d.getFullYear());
  const carnaval = new Date(pascoaDate);
  carnaval.setDate(pascoaDate.getDate() - 47);
  return d.getDate() === carnaval.getDate() && d.getMonth() === carnaval.getMonth() && d.getFullYear() === carnaval.getFullYear();
}

function isCorpusChristi(d: Date): boolean {
  const pascoaDate = pascoa(d.getFullYear());
  const cc = new Date(pascoaDate);
  cc.setDate(pascoaDate.getDate() + 60);
  return d.getDate() === cc.getDate() && d.getMonth() === cc.getMonth() && d.getFullYear() === cc.getFullYear();
}

// Recesso forense: 20 de dezembro a 20 de janeiro (Resolução CNJ nº 1/2020)
function isRecessoForense(d: Date): boolean {
  const m = d.getMonth();
  const day = d.getDate();
  // Dezembro: dia 20 a 31
  if (m === 11 && day >= 20) return true;
  // Janeiro: dia 1 a 20
  if (m === 0 && day <= 20) return true;
  return false;
}

// Verifica se uma data é feriado nacional
export function isFeriadoNacional(d: Date): boolean {
  return (
    isAnoNovo(d) ||
    isCarnaval(d) ||
    isSextaSanta(d) ||
    isTiradentes(d) ||
    isTrabalho(d) ||
    isCorpusChristi(d) ||
    isIndependencia(d) ||
    isNossaSenhora(d) ||
    isFinados(d) ||
    isProclamacao(d) ||
    isConscienciaNegra(d) ||
    isNatal(d)
  );
}

// Verifica se uma data é dia útil (não fim de semana, não feriado, não recesso)
export function isDiaUtil(d: Date, feriadosAdicionais: Date[] = []): boolean {
  const day = d.getDay();
  if (day === 0 || day === 6) return false; // domingo ou sábado
  if (isFeriadoNacional(d)) return false;
  if (isRecessoForense(d)) return false;
  for (const f of feriadosAdicionais) {
    if (d.getDate() === f.getDate() && d.getMonth() === f.getMonth() && d.getFullYear() === f.getFullYear()) {
      return false;
    }
  }
  return true;
}

// ============================================================
// Cálculo de prazos processuais
// ============================================================

export type TipoPrazo = "dias_uteis" | "dias_corridos" | "horas";

export interface CalculoPrazoOpts {
  tipo: TipoPrazo;
  dias: number;
  dataInicio?: Date;        // padrão: hoje
  feriadosAdicionais?: Date[]; // feriados estaduais/municipais
  incluirIntimacao?: boolean;  // se true, o dia da intimacao conta (CPC art. 224)
}

// Calcula o prazo processual
export function calcularPrazo(opts: CalculoPrazoOpts): { dataVencimento: Date; diasUteisContados: number } {
  const inicio = opts.dataInicio ?? new Date();
  const feriados = opts.feriadosAdicionais ?? [];

  if (opts.tipo === "dias_corridos") {
    // Dias corridos: apenas somar os dias
    const vencimento = new Date(inicio);
    vencimento.setDate(inicio.getDate() + opts.dias);
    return { dataVencimento: vencimento, diasUteisContados: opts.dias };
  }

  if (opts.tipo === "horas") {
    // Prazo em horas: converter para dias (24h = 1 dia corrido)
    const vencimento = new Date(inicio);
    vencimento.setHours(inicio.getHours() + opts.dias);
    return { dataVencimento: vencimento, diasUteisContados: 0 };
  }

  // Dias úteis: contar apenas dias úteis
  // CPC art. 224: "Salvo disposição em contrário, os prazos serão contados excluindo o dia do começo e incluindo o dia do vencimento."
  let count = 0;
  let current = new Date(inicio);
  current.setDate(current.getDate() + 1); // excluir o dia do começo

  while (count < opts.dias) {
    if (isDiaUtil(current, feriados)) {
      count++;
    }
    if (count < opts.dias) {
      current.setDate(current.getDate() + 1);
    }
  }

  // Se o último dia cair em dia não útil, prorrogar para o próximo dia útil (CPC art. 224, §1º)
  while (!isDiaUtil(current, feriados)) {
    current.setDate(current.getDate() + 1);
  }

  return { dataVencimento: current, diasUteisContados: count };
}

// Lista os próximos N dias úteis a partir de hoje (útil para UI de seleção)
export function proximosDiasUteis(n: number, feriadosAdicionais: Date[] = []): Date[] {
  const result: Date[] = [];
  let current = new Date();
  while (result.length < n) {
    if (isDiaUtil(current, feriadosAdicionais)) {
      result.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }
  return result;
}

// Formata data para exibição (dd/mm/aaaa)
export function formatDataBR(d: Date): string {
  return d.toLocaleDateString("pt-BR");
}

// Formata data com dia da semana
export function formatDataCompletaBR(d: Date): string {
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  return `${dias[d.getDay()]}, ${d.toLocaleDateString("pt-BR")}`;
}

// Tabela de prazos comuns do CPC/2015 (referência)
export const PRAZOS_CPC: Record<string, { tipo: TipoPrazo; dias: number; descricao: string }> = {
  "contestacao": { tipo: "dias_uteis", dias: 15, descricao: "Contestação (CPC art. 335)" },
  "recurso_apelacao": { tipo: "dias_uteis", dias: 15, descricao: "Apelação (CPC art. 1.003, §5º)" },
  "recurso_agravo": { tipo: "dias_uteis", dias: 15, descricao: "Agravo de Instrumento (CPC art. 1.003, §5º)" },
  "embargos_declaracao": { tipo: "dias_uteis", dias: 5, descricao: "Embargos de Declaração (CPC art. 1.023)" },
  "recurso_extraordinario": { tipo: "dias_uteis", dias: 15, descricao: "RE e REsp (CPC art. 1.003, §5º)" },
  "recurso_especial": { tipo: "dias_uteis", dias: 15, descricao: "REsp (CPC art. 1.003, §5º)" },
  "impugnacao_cumprimento": { tipo: "dias_uteis", dias: 15, descricao: "Impugnação ao Cumprimento de Sentença (CPC art. 525)" },
  "cumprimento_sentenca": { tipo: "dias_uteis", dias: 15, descricao: "Cumprimento Definitivo de Sentença (CPC art. 513)" },
  "manifestacao": { tipo: "dias_uteis", dias: 5, descricao: "Manifestação geral (5 dias úteis)" },
  "manifestacao_15": { tipo: "dias_uteis", dias: 15, descricao: "Manifestação (15 dias úteis)" },
  "manifestacao_30": { tipo: "dias_uteis", dias: 30, descricao: "Manifestação (30 dias úteis)" },
  "personalizado": { tipo: "dias_uteis", dias: 0, descricao: "Prazo personalizado" },
};
