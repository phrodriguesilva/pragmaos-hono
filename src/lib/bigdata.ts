// BigDataCorp API client — powers the Consultas Legais module.
//
// BigDataCorp provides a unified data API with 40+ sources (DETRAN, Receita
// Federal, SERASA, etc.). All endpoints use POST with JWT auth via headers
// `AccessToken` and `TokenId`.
//
// Docs: https://docs.bigdatacorp.com.br/plataforma/reference
// Pricing: R$ 0,04–0,14 per dataset (very affordable)

import { BIGDATA_ACCESS_TOKEN, BIGDATA_TOKEN_ID } from "./env";

const BIGDATA_BASE_URL = "https://plataforma.bigdatacorp.com.br";

export type BigDataEndpoint = "pessoas" | "empresas" | "veiculos";

export type BigDataQuery = {
  q: string;                  // e.g. "doc{12345678900}" or "plate{ABC1234}"
  Datasets: string;           // comma-separated dataset names
  Limit?: number;             // max entities (for non-key queries)
};

export type BigDataResponse = {
  // BigDataCorp returns an array of entity objects, each with a "Result" object.
  Result: Array<{
    "BasicData"?: {
      "TaxId"?: string;
      "Name"?: string;
      "BirthDate"?: string;
      "Gender"?: string;
      "MothersName"?: string;
      "FathersName"?: string;
      "DeathDate"?: string;
      "Status"?: string;
    };
    "Contacts"?: {
      "Emails"?: string[];
      "Phones"?: string[];
      "Addresses"?: Array<{
        "Street"?: string;
        "Number"?: string;
        "Complement"?: string;
        "District"?: string;
        "City"?: string;
        "State"?: string;
        "ZipCode"?: string;
      }>;
    };
    "QSA"?: Array<{
      "Name"?: string;
      "TaxId"?: string;
      "Role"?: string;
    }>;
    "CompanyData"?: {
      "TaxId"?: string;
      "CompanyName"?: string;
      "TradeName"?: string;
      "Status"?: string;
      "CNAE"?: string;
      "CNAEDescription"?: string;
      "Street"?: string;
      "Number"?: string;
      "District"?: string;
      "City"?: string;
      "State"?: string;
      "ZipCode"?: string;
      "Capital"?: string;
      "OpeningDate"?: string;
    };
    "Relationships"?: Array<{
      "Name"?: string;
      "TaxId"?: string;
      "RelationshipType"?: string;
    }>;
    "Vehicles"?: Array<{
      "Plate"?: string;
      "Brand"?: string;
      "Model"?: string;
      "Year"?: string;
      "Color"?: string;
      "Chassis"?: string;
      "Renavam"?: string;
    }>;
    "PlateData"?: {
      "Plate"?: string;
      "Brand"?: string;
      "Model"?: string;
      "Year"?: string;
      "Color"?: string;
      "Chassis"?: string;
      "Renavam"?: string;
      "OwnerName"?: string;
      "OwnerTaxId"?: string;
      "Restrictions"?: string[];
    };
    "VehicleDebits"?: {
      "Fines"?: Array<{
        "Description"?: string;
        "Amount"?: string;
        "Date"?: string;
        "Status"?: string;
      }>;
      "IPVA"?: string;
      "Licensing"?: string;
      "TotalDebits"?: string;
    };
    "RiskData"?: {
      "RiskLevel"?: string;
      "RiskScore"?: string;
      "NegativeRecords"?: Array<{
        "Source"?: string;
        "Amount"?: string;
        "Date"?: string;
      }>;
    };
    "DebtCollection"?: {
      "HasDebts"?: boolean;
      "TotalDebts"?: string;
      "Debts"?: Array<{
        "Creditor"?: string;
        "Amount"?: string;
        "Date"?: string;
      }>;
    };
    "Processes"?: Array<{
      "Number"?: string;
      "Court"?: string;
      "Subject"?: string;
      "Value"?: string;
      "Date"?: string;
    }>;
    [key: string]: unknown;
  }>;
  Status: string;
  Message?: string;
  // Raw response also includes metadata about datasets queried.
};

export type ConsultaResult = {
  success: boolean;
  data?: BigDataResponse;
  error?: string;
};

// Check if BigDataCorp is configured.
export function isBigDataConfigured(): boolean {
  return BIGDATA_ACCESS_TOKEN.length > 0 && BIGDATA_TOKEN_ID.length > 0;
}

// Build the query string for a given input type and value.
export function buildQuery(inputType: string, value: string): string {
  const clean = value.replace(/\D/g, "");
  switch (inputType) {
    case "cpf":
      return `doc{${clean}}`;
    case "cnpj":
      return `doc{${clean}}`;
    case "placa":
      return `plate{${value.toUpperCase().replace(/[^A-Z0-9]/g, "")}}`;
    case "cpf_cnpj":
      // Auto-detect CPF (11 digits) vs CNPJ (14 digits)
      return `doc{${clean}}`;
    default:
      return `doc{${clean}}`;
  }
}

// Execute a BigDataCorp API call.
export async function callBigData(
  endpoint: BigDataEndpoint,
  query: BigDataQuery,
): Promise<ConsultaResult> {
  if (!isBigDataConfigured()) {
    return {
      success: false,
      error: "Consultas Legais nao configuradas. Configure BIGDATA_ACCESS_TOKEN e BIGDATA_TOKEN_ID.",
    };
  }

  try {
    const response = await fetch(`${BIGDATA_BASE_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        "AccessToken": BIGDATA_ACCESS_TOKEN,
        "TokenId": BIGDATA_TOKEN_ID,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(query),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `BigDataCorp API error ${response.status}: ${text.slice(0, 500)}`,
      };
    }

    const data = (await response.json()) as BigDataResponse;
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: `Erro ao conectar com BigDataCorp: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// --- Input validation helpers ---

export function isValidCPF(value: string): boolean {
  const clean = value.replace(/\D/g, "");
  return clean.length === 11;
}

export function isValidCNPJ(value: string): boolean {
  const clean = value.replace(/\D/g, "");
  return clean.length === 14;
}

export function isValidPlaca(value: string): boolean {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Old format: LLLNNNN (7 chars) or Mercosul: LLLNLNN (7 chars)
  return clean.length === 7 && /^[A-Z0-9]+$/.test(clean);
}

export function detectDocType(value: string): "cpf" | "cnpj" | null {
  const clean = value.replace(/\D/g, "");
  if (clean.length === 11) return "cpf";
  if (clean.length === 14) return "cnpj";
  return null;
}

// --- Formatting helpers ---

export function formatCPF(value: string): string {
  const clean = value.replace(/\D/g, "");
  if (clean.length !== 11) return value;
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function formatCNPJ(value: string): string {
  const clean = value.replace(/\D/g, "");
  if (clean.length !== 14) return value;
  return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export function formatDoc(value: string): string {
  const clean = value.replace(/\D/g, "");
  if (clean.length === 11) return formatCPF(value);
  if (clean.length === 14) return formatCNPJ(value);
  return value;
}

// --- Credit system helpers ---

// Plan-based credit allocation per month.
export const PLAN_CREDITS: Record<string, number> = {
  trial: 3,
  starter: 15,
  pro: 50,
  enterprise: 200,
};

export function getPlanCredits(plan: string | null | undefined): number {
  return PLAN_CREDITS[plan ?? "trial"] ?? PLAN_CREDITS.trial ?? 3;
}

// Get current month key (first day of month as ISO date string).
export function getCurrentMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}
