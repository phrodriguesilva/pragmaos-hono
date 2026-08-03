// NFS-e (Nota Fiscal de Serviço Eletrônica)
// Integração com prefeituras via API Nacional NFS-e (padrão ABRASF).
// PragmaOS 2.

import { supabase } from "./supabase";
import { decryptConfigSecrets } from "./crypto";

export interface NfseDados {
  tomadorCpfCnpj: string;
  tomadorNome: string;
  tomadorEmail?: string;
  tomadorEndereco?: string;
  tomadorMunicipio?: string;
  tomadorUf?: string;
  servicoCodigo: string;
  servicoDescricao: string;
  valorServicos: number; // em centavos
  aliquota: number; // ex: 0.03 = 3%
  discriminacao: string;
  municipioPrestacao: string;
}

export interface NfseResultado {
  success: boolean;
  numero?: string;
  codigoVerificacao?: string;
  link?: string;
  error?: string;
}

// Emitir NFS-e via API Nacional (padrão ABRASF)
export async function emitirNfse(
  tenantId: string,
  dados: NfseDados
): Promise<NfseResultado> {
  // Buscar configuração NFS-e
  const { data: integration } = await supabase
    .from("integrations")
    .select("config, access_token")
    .eq("tenant_id", tenantId)
    .eq("type", "nfse")
    .eq("active", true)
    .maybeSingle();

  if (!integration) {
    return { success: false, error: "Integracao NFS-e nao configurada. Configure em Integracoes." };
  }

  const config = decryptConfigSecrets((integration.config as Record<string, unknown>) ?? {});
  const apiKey = (integration.access_token as string) ?? (config.api_key as string) ?? "";
  const cnpjPrestador = config.cnpj as string ?? "";
  const inscricaoMunicipal = config.inscricao_municipal as string ?? "";

  if (!apiKey || !cnpjPrestador) {
    return { success: false, error: "Configuracao NFS-e incompleta (API key, CNPJ)" };
  }

  // Calcular ISS
  const valorBase = dados.valorServicos;
  const valorIss = Math.round(valorBase * dados.aliquota);

  // Payload ABRASF
  const payload = {
    prestador: {
      cnpj: cnpjPrestador,
      inscricaoMunicipal,
    },
    tomador: {
      identificacaoTomador: {
        cpfCnpj: dados.tomadorCpfCnpj.replace(/\D/g, ""),
      },
      razaoSocial: dados.tomadorNome,
      email: dados.tomadorEmail,
      endereco: dados.tomadorEndereco ? {
        logradouro: dados.tomadorEndereco,
        municipio: dados.tomadorMunicipio,
        uf: dados.tomadorUf,
      } : undefined,
    },
    servico: {
      itemListaServico: dados.servicoCodigo,
      discriminacao: dados.discriminacao,
      codigoMunicipio: dados.municipioPrestacao,
      valores: {
        valorServicos: (valorBase / 100).toFixed(2),
        iss: {
          aliquota: (dados.aliquota * 100).toFixed(2),
          valorIss: (valorIss / 100).toFixed(2),
        },
      },
    },
  };

  try {
    // API Nacional NFS-e (https://nfse.io/api)
    const response = await fetch("https://api.nfse.io/v2/nfse", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: `Erro NFS-e: ${response.status} - ${errText}` };
    }

    const result = await response.json() as {
      numero?: string;
      codigoVerificacao?: string;
      link?: string;
    };

    return {
      success: true,
      numero: result.numero,
      codigoVerificacao: result.codigoVerificacao,
      link: result.link,
    };
  } catch (err) {
    return { success: false, error: `Erro ao emitir NFS-e: ${err}` };
  }
}

// Códigos de serviço comuns para advocacia (Lista ABRASF)
export const SERVICOS_ADVOCACIA: { value: string; label: string }[] = [
  { value: "1.01", label: "Advocacia - Consultoria juridica" },
  { value: "1.02", label: "Advocacia - Elaboracao de contratos" },
  { value: "1.03", label: "Advocacia - Acompanhamento processual" },
  { value: "1.04", label: "Advocacia - Patrocinio judicial" },
  { value: "1.05", label: "Advocacia - Mediação e conciliacao" },
  { value: "1.06", label: "Advocacia - Assessoria empresarial" },
  { value: "1.07", label: "Advocacia - Parecer juridico" },
  { value: "1.08", label: "Advocacia - Outros servicos juridicos" },
];
