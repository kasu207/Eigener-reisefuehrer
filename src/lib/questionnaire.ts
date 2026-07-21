import { z } from "zod";

// Interessen gemäß Anforderung 4.1 (3)
export const INTERESTS = [
  "wandern",
  "kulinarik",
  "kultur_geschichte",
  "doerfer_maerkte",
  "seen_baden",
  "aussichtspunkte_fotografie",
  "sport_aktivitaet",
  "entspannung",
] as const;

export type Interest = (typeof INTERESTS)[number];

export const INTEREST_LABELS: Record<Interest, string> = {
  wandern: "Wandern",
  kulinarik: "Kulinarik",
  kultur_geschichte: "Kultur & Geschichte",
  doerfer_maerkte: "Dörfer & Märkte",
  seen_baden: "Seen & Baden",
  aussichtspunkte_fotografie: "Aussichtspunkte & Fotografie",
  sport_aktivitaet: "Sport & Aktivität",
  entspannung: "Entspannung",
};

export const questionnaireSchema = z.object({
  // 1. Reise-Basisdaten
  regionSlug: z.string().min(1).default("comer-see"),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accommodation: z.object({
    label: z.string().min(1).max(200),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
  }),
  // Weitere Anker-Orte, um die herum explizit Inhalte entstehen sollen:
  // zusätzliche Unterkünfte oder selbst gewählte Must-See-Orte. Jeder Anker
  // wird geocodiert und erhält (falls kein eigenes Ort-Kapitel existiert) eine
  // "Rund um ..."-Sektion mit den nächstgelegenen geprüften Orten.
  anchors: z
    .array(
      z.object({
        label: z.string().min(1).max(200),
        lat: z.number().min(-90).max(90).nullable().optional(),
        lng: z.number().min(-180).max(180).nullable().optional(),
      })
    )
    .max(10)
    .default([]),
  // Mehrere Transportmittel möglich (nicht exklusiv); der Guide fokussiert
  // sich nicht auf ein Verkehrsmittel, sondern nennt jeweils die Optionen.
  mobility: z.array(z.enum(["car", "public", "foot"])).min(1).default(["car", "public"]),

  // 2. Reisende
  adults: z.number().int().min(1).max(20),
  children: z
    .array(z.object({ ageGroup: z.enum(["0-3", "4-9", "10-14", "15-17"]) }))
    .max(10)
    .default([]),
  occasion: z.string().max(300).optional().default(""),

  // 3. Interessen mit Gewichtung
  interests: z
    .array(
      z.object({
        key: z.enum(INTERESTS),
        weight: z.enum(["wichtig", "interessant"]),
      })
    )
    .min(1)
    .max(INTERESTS.length),

  // 4. Aktivität
  fitnessLevel: z.enum(["niedrig", "mittel", "hoch"]),
  maxHikeDurationMin: z.number().int().min(30).max(720),
  maxElevationGainM: z.number().int().min(0).max(3000),
  pace: z.enum(["entspannt", "ausgewogen", "vollgepackt"]),

  // 5. Kulinarik
  priceLevel: z.number().int().min(1).max(4),
  diets: z.array(z.enum(["vegetarian", "vegan", "glutenfree"])).default([]),
  foodPreferences: z
    .array(z.enum(["regional_traditionell", "gehoben", "unkompliziert", "aperitivo_bar"]))
    .default([]),

  // 6. Kontakt
  firstNames: z.string().min(1).max(200),
  email: z.string().email().max(320),
  gdprConsent: z.literal(true),
});

export type Questionnaire = z.infer<typeof questionnaireSchema>;

export function tripDays(q: Questionnaire): number {
  const from = new Date(q.dateFrom);
  const to = new Date(q.dateTo);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  return Math.max(1, Math.min(days, 30));
}
