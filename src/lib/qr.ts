import QRCode from "qrcode";

/**
 * Offline-QR-Code als Data-URI (SVG). Läuft ohne Netz und ohne externe
 * Dienste – für die Wander-Links im Guide (auch im PDF druckbar).
 */
export async function qrDataUri(url: string): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#24211c", light: "#ffffff" },
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
