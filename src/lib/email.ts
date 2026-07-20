/**
 * Versand des Ergebnis-Links per Transaktionsmail (Resend).
 * Ohne RESEND_API_KEY wird der Link nur geloggt (lokale Entwicklung).
 */
export async function sendGuideReadyEmail(to: string, guideUrl: string, firstNames: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM ?? "Reiseführer <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(`[email] (kein RESEND_API_KEY) Guide-Link für ${to}: ${guideUrl}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Euer persönlicher Reiseführer ist fertig",
      html: `
        <p>Hallo ${escapeHtml(firstNames)},</p>
        <p>euer persönlicher Reiseführer ist fertig! Ihr findet ihn unter diesem Link:</p>
        <p><a href="${guideUrl}">${guideUrl}</a></p>
        <p>Der Link ist nur für euch bestimmt – bitte nicht öffentlich teilen.</p>
        <p>Viel Freude bei der Reise!</p>
      `,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend-Fehler ${res.status}: ${await res.text()}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
