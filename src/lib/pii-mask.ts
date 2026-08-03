// PII masking helpers for LGPD compliance.
// These regex-based masks partially obscure PII before sending text to an
// external LLM provider, so that raw client data never leaves the system.

// Mask CPF: 123.456.789-00 -> ***.456.789-**
export function maskCPF(value: string): string {
  return value.replace(/(\d{3})\.(\d{3})\.(\d{3})-(\d{2})/g, "***.$2.$3-**");
}

// Mask CNPJ: 12.345.678/0001-90 -> **.345.678/****-**
export function maskCNPJ(value: string): string {
  return value.replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})-(\d{2})/g, "**.$2.$3/****-**");
}

// Mask email: joao@example.com -> j***@example.com
export function maskEmail(value: string): string {
  return value.replace(/([a-zA-Z0-9])[a-zA-Z0-9._-]*@([a-zA-Z0-9.-]+)/g, "$1***@$2");
}

// Mask phone: (11) 99999-9999 -> (11) 9****-9999
export function maskPhone(value: string): string {
  return value.replace(/\((\d{2})\)\s*(\d)\d{4}-(\d{4})/g, "($1) $2****-$3");
}

// Apply all masks to a text block.
export function maskPII(text: string): string {
  return maskPhone(maskEmail(maskCNPJ(maskCPF(text))));
}
