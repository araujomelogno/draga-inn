/**
 * Adaptador de email. En v1 el proveedor es Resend; la interfaz queda mínima
 * para poder cambiarlo sin tocar el dispatcher.
 */
export type EmailMessage = { to: string[]; subject: string; text: string };

export type EmailResult = { sent: boolean; id?: string; error?: string };

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  if (process.env.NOTIFICATIONS_ENABLED !== 'true') {
    // En desarrollo no se envía: se registra qué se habría enviado, sin el cuerpo
    // (puede contener datos personales).
    console.log(JSON.stringify({ severity: 'INFO', event: 'email.skipped', recipients: msg.to.length, subject: msg.subject }));
    return { sent: false, error: 'NOTIFICATIONS_ENABLED=false' };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: 'Falta RESEND_API_KEY.' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.NOTIFICATIONS_FROM ?? 'Draga Inn <no-responder@dragainn.uy>',
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
    }),
  });

  if (!res.ok) return { sent: false, error: `Resend ${res.status}` };
  const body = (await res.json()) as { id?: string };
  return { sent: true, id: body.id };
}
