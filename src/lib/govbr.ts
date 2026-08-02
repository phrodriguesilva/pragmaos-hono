// Gov.br OAuth login integration
// https://manual-roteiro-integracao-login-unico.estaleiro.serpro.gov.br/
// PragmaOS 2.

import { APP_URL } from "./env";

const rawEnv = typeof Bun !== "undefined" ? Bun.env : process.env;

export interface GovBrTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface GovBrUserInfo {
  sub: string;
  cpf: string;
  name: string;
  email: string;
  phone_number?: string;
  picture?: string;
  email_verified: boolean;
  phone_number_verified?: boolean;
}

// URLs do Gov.br (produção)
const GOVBR_URLS = {
  authorize: "https://sso.acesso.gov.br/authorize",
  token: "https://sso.acesso.gov.br/token",
  userinfo: "https://sso.acesso.gov.br/userinfo",
  logout: "https://sso.acesso.gov.br/logout",
};

export function getGovBrConfig() {
  const clientId = rawEnv.GOVBR_CLIENT_ID ?? "";
  const clientSecret = rawEnv.GOVBR_CLIENT_SECRET ?? "";
  const redirectUri = rawEnv.GOVBR_REDIRECT_URI ?? `${APP_URL}/auth/govbr/callback`;
  return { clientId, clientSecret, redirectUri, enabled: !!clientId && !!clientSecret };
}

// Gera URL de autorização do Gov.br
export function getGovBrAuthUrl(state: string): string {
  const config = getGovBrConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "openid email phone profile",
    state,
  });
  return `${GOVBR_URLS.authorize}?${params.toString()}`;
}

// Troca code por access_token
export async function exchangeGovBrCode(
  code: string
): Promise<{ success: boolean; token?: GovBrTokenResponse; error?: string }> {
  const config = getGovBrConfig();
  if (!config.enabled) {
    return { success: false, error: "Gov.br OAuth nao configurado" };
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  try {
    const response = await fetch(GOVBR_URLS.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `Erro token Gov.br: ${response.status} - ${err}` };
    }

    const token = await response.json() as GovBrTokenResponse;
    return { success: true, token };
  } catch (err) {
    return { success: false, error: `Erro: ${err}` };
  }
}

// Busca dados do usuário no Gov.br
export async function getGovBrUserInfo(
  accessToken: string
): Promise<{ success: boolean; user?: GovBrUserInfo; error?: string }> {
  try {
    const response = await fetch(GOVBR_URLS.userinfo, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return { success: false, error: `Erro userinfo: ${response.status}` };
    }

    const user = await response.json() as GovBrUserInfo;
    return { success: true, user };
  } catch (err) {
    return { success: false, error: `Erro: ${err}` };
  }
}

// URL de logout
export function getGovBrLogoutUrl(postLogoutRedirectUri: string): string {
  const params = new URLSearchParams({
    post_logout_redirect_uri: postLogoutRedirectUri,
  });
  return `${GOVBR_URLS.logout}?${params.toString()}`;
}
