import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

// Generate a new TOTP secret for a user.
export function generateTOTPSecret(email: string, issuer = "PragmaOS"): { secret: string; uri: string } {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  return {
    secret: secret.base32,
    uri: totp.toString(),
  };
}

// Validate a 6-digit TOTP code against a stored base32 secret.
// Allows ±30s clock drift (window=1).
export function validateTOTP(code: string, base32Secret: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: "PragmaOS",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(base32Secret),
    });
    // window=1 allows ±30s drift (checks current, previous, next period)
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}

// Generate a QR code as a base64-encoded PNG data URI.
export async function generateQRCodeDataURL(otpUri: string): Promise<string> {
  return await QRCode.toDataURL(otpUri, { width: 200, margin: 1 });
}

// Build a TOTP URI from an existing base32 secret and email (for QR regeneration).
export function buildTOTPUri(email: string, base32Secret: string, issuer = "PragmaOS"): string {
  const totp = new OTPAuth.TOTP({
    issuer,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  });
  return totp.toString();
}

// Generate backup codes (10 codes, 8 chars each, alphanumeric without ambiguous chars).
export function generateBackupCodes(count = 10): string[] {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let code = "";
    for (let j = 0; j < 8; j++) {
      const randomValues = new Uint8Array(1);
      crypto.getRandomValues(randomValues);
      code += chars[(randomValues[0] ?? 0) % chars.length];
    }
    codes.push(code);
  }
  return codes;
}
