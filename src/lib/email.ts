import nodemailer from "nodemailer";
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, APP_URL } from "./env";
import { log } from "./logger";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export function isEmailEnabled(): boolean {
  return getTransporter() !== null;
}

export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    log.warn("SMTP not configured — skipping verification email", { email });
    return false;
  }

  const verifyUrl = `${APP_URL}/verify?token=${token}`;
  const from = SMTP_FROM || `PragmaOS <${SMTP_USER}>`;

  try {
    await t.sendMail({
      from,
      to: email,
      subject: "Confirme seu email — PragmaOS",
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:2rem;">
          <h1 style="color:#0568ff;">Bem-vindo ao PragmaOS!</h1>
          <p style="color:#6b7280;font-size:1.1rem;">Sua conta foi criada com sucesso. Para comecar a usar o PragmaOS, confirme seu email clicando no botao abaixo:</p>
          <p style="text-align:center;margin:2rem 0;">
            <a href="${verifyUrl}" style="display:inline-block;background:#0568ff;color:white;padding:0.75rem 2rem;border-radius:0.5rem;text-decoration:none;font-weight:600;">Confirmar Email</a>
          </p>
          <p style="color:#9ca3af;font-size:0.875rem;">Se voce nao criou uma conta no PragmaOS, pode ignorar este email.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:2rem 0;" />
          <p style="color:#9ca3af;font-size:0.75rem;">PragmaOS — Sistema de gestao para escritorios de advocacia</p>
        </div>
      `,
      text: `Bem-vindo ao PragmaOS!\n\nSua conta foi criada. Confirme seu email acessando:\n${verifyUrl}\n\nSe voce nao criou uma conta, ignore este email.`,
    });
    log.info("Verification email sent", { email });
    return true;
  } catch (err) {
    log.error("Failed to send verification email", { email, error: (err as Error).message });
    return false;
  }
}
