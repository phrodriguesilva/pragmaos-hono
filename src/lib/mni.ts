// MNI (Modelo Nacional de Interoperabilidade) - PJe
// Consulta de processos via SOAP/WSDL nos tribunais brasileiros.
// PragmaOS 2.

import { supabase } from "./supabase";

export interface MNIProcesso {
  numero: string;
  tribunal: string;
  classe: string;
  assunto: string;
  orgaoJulgador: string;
  dataDistribuicao: string;
  poloAtivo: { nome: string; documento?: string }[];
  poloPassivo: { nome: string; documento?: string }[];
  movimentos: {
    codigo: string;
    descricao: string;
    data: string;
  }[];
}

// Endpoint MNI por tribunal (SOAP)
const MNI_ENDPOINTS: Record<string, string> = {
  "TJSP": "https://esaj.tjsp.jus.br/cpopss/open.do",
  "TJRJ": "https://www3.tjrj.jus.br/consultaprocessualweb",
  "TJMG": "https://www4.tjmg.jus.br/sij/Processo/Consulta.do",
  "TRF3": "https://pje.trf3.jus.br/consultaprocessual/",
  // MNI SOAP endpoints reais (quando disponiveis)
  "PJE_TJSP": "https://pje.tjsp.jus.br/intercomunicacao-2.5/intercomunicacao?wsdl",
  "PJE_TJRJ": "https://pje1g.tjrj.jus.br/intercomunicacao-2.5/intercomunicacao?wsdl",
};

export async function consultarProcessoMNI(
  tenantId: string,
  numeroProcesso: string,
  tribunal: string
): Promise<{ success: boolean; processo?: MNIProcesso; error?: string }> {
  // Buscar credenciais MNI/PJe configuradas
  const { data: integration } = await supabase
    .from("integrations")
    .select("config, access_token")
    .eq("tenant_id", tenantId)
    .eq("type", "pje_mni")
    .eq("active", true)
    .maybeSingle();

  if (!integration) {
    return { success: false, error: "Integracao PJe/MNI nao configurada. Configure em Integracoes." };
  }

  const config = (integration.config as Record<string, unknown>) ?? {};
  const username = config.username as string ?? "";
  const password = config.password as string ?? "";
  const endpoint = MNI_ENDPOINTS[tribunal] ?? "";

  if (!endpoint) {
    return { success: false, error: `Tribunal ${tribunal} nao suportado` };
  }

  // SOAP request body for MNI consulta processo
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ns="http://www.cnj.jus.br/servicos-intercomunicacao-2.2/">
  <soap:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${username}</wsse:Username>
        <wsse:Password>${password}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <ns:consultarProcesso>
      <ns:idConsultante>pragmaos</ns:idConsultante>
      <ns:senhaConsultante>${password}</ns:senhaConsultante>
      <ns:numeroProcesso>${numeroProcesso}</ns:numeroProcesso>
    </ns:consultarProcesso>
  </soap:Body>
</soap:Envelope>`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "consultarProcesso",
      },
      body: soapBody,
    });

    if (!response.ok) {
      return { success: false, error: `Erro MNI: ${response.status} ${response.statusText}` };
    }

    const xmlResponse = await response.text();

    // Parse SOAP response (simplified - in production use a proper XML parser)
    const processo = parseMNIResponse(xmlResponse, numeroProcesso, tribunal);
    return { success: true, processo };
  } catch (err) {
    return { success: false, error: `Erro ao consultar MNI: ${err}` };
  }
}

// Simplified XML parser for MNI response
function parseMNIResponse(xml: string, numero: string, tribunal: string): MNIProcesso {
  // Extract basic fields from XML response
  const extract = (tag: string): string => {
    const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "s"));
    return match?.[1]?.trim() ?? "";
  };

  return {
    numero,
    tribunal,
    classe: extract("classeProcessual"),
    assunto: extract("assunto"),
    orgaoJulgador: extract("orgaoJulgador"),
    dataDistribuicao: extract("dataDistribuicao"),
    poloAtivo: [],
    poloPassivo: [],
    movimentos: [],
  };
}

// Lista de tribunais suportados
export const TRIBUNAIS_SUPORTADOS: { value: string; label: string }[] = [
  { value: "PJE_TJSP", label: "TJSP (PJe)" },
  { value: "PJE_TJRJ", label: "TJRJ (PJe)" },
  { value: "TJSP", label: "TJSP (e-SAJ)" },
  { value: "TJRJ", label: "TJRJ" },
  { value: "TJMG", label: "TJMG" },
  { value: "TRF3", label: "TRF3" },
];
