import { randomBytes } from "crypto";

/** Nicht erratbarer Guide-Link-Token, >= 128 Bit Entropie (Anforderung 8). */
export function generatePublicToken(): string {
  return randomBytes(24).toString("base64url"); // 192 Bit
}
