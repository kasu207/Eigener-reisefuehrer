/**
 * Versand des Ergebnis-Links per Transaktionsmail (Resend).
 * Ohne RESEND_API_KEY wird der Link nur geloggt (lokale Entwicklung).
 */
export async function sendGuideReadyEmail(
  to: string,
  guideUrl: string,
  firstNames: string,
  isRevision = false
) {
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
      subject: isRevision
        ? "Euer Reiseführer wurde nach euren Wünschen angepasst"
        : "Euer persönlicher Reiseführer ist fertig",
      html: `
        <p>Hallo ${escapeHtml(firstNames)},</p>
        <p>${
          isRevision
            ? "wir haben euren Reiseführer nach euren Wünschen überarbeitet. Ihr findet die neue Version unter eurem gewohnten Link:"
            : "euer persönlicher Reiseführer ist fertig! Ihr findet ihn unter diesem Link:"
        }</p>
        <p><a href="${guideUrl}">${guideUrl}</a></p>
        <p>Der Link ist nur für euch bestimmt. Zum Teilen mit Mitreisenden gibt es auf der Guide-Seite einen eigenen Lese-Link.</p>
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
