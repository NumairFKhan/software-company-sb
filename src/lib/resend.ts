/**
 * Resend email helper.
 *
 * Sends transactional emails via the Resend API using the official SDK.
 * Falls back to a console warning if RESEND_API_KEY is not configured
 * (e.g., in local dev without the key set).
 *
 * HTML templates live in /emails/ at the project root.
 * Variables are substituted with a simple {{VARIABLE_NAME}} syntax.
 */

import { Resend } from "resend";
import { readFileSync } from "fs";
import { join } from "path";

let resendInstance: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendInstance) {
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  /** Filename inside /emails/ — e.g. "booking-player.html" */
  template: string;
  variables: Record<string, string>;
}

/**
 * Reads the HTML template from /emails/{template}, substitutes {{KEY}} tokens,
 * and sends the email via Resend.
 *
 * Never throws — errors are logged to console so that a failed email does not
 * break the calling request.
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn(
      `[Resend] RESEND_API_KEY not configured — skipping email to ${options.to} (subject: "${options.subject}")`
    );
    return;
  }

  // Read template
  let html: string;
  try {
    const templatePath = join(process.cwd(), "emails", options.template);
    html = readFileSync(templatePath, "utf-8");
  } catch (err) {
    console.error(`[Resend] Could not read template "${options.template}":`, err);
    return;
  }

  // Substitute {{KEY}} tokens
  for (const [key, value] of Object.entries(options.variables)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }

  const from =
    process.env.RESEND_FROM_EMAIL ?? "CourtSide <noreply@courtside.app>";

  try {
    const { error } = await resend.emails.send({
      from,
      to: options.to,
      subject: options.subject,
      html,
    });

    if (error) {
      console.error("[Resend] Send error:", error);
    }
  } catch (err) {
    console.error("[Resend] Unexpected error:", err);
  }
}
