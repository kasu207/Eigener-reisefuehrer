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

/** Längste Reise, die die Auswahl-Engine sinnvoll abdeckt. */
export const MAX_TRIP_DAYS = 30;

/** Ist der String ein echter Kalendertag (nicht nur JJJJ-MM-TT-förmig)? */
export function isRealCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  // `new Date` rollt den 31. Februar still auf den 3. März weiter – der
  // Rückweg über toISOString deckt genau das auf.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Basis-Schema. Wird auch zum Lesen bereits gespeicherter Fragebögen benutzt
 * und bleibt deshalb bewusst nachsichtig: Strengere Regeln kämen sonst
 * rückwirkend auf Altdaten an und ließen bestehende Guides beim Öffnen
 * fehlschlagen. Für neue Eingaben gilt `questionnaireInputSchema`.
 */
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
  // E-Mail ist optional und wird erst NACH der Erstellung auf der Guide-Seite
  // abgefragt (zum Link-Sichern/Benachrichtigen). Leer erlaubt.
  email: z.union([z.string().email().max(320), z.literal("")]).default(""),
  gdprConsent: z.literal(true),
});

export type Questionnaire = z.infer<typeof questionnaireSchema>;

/**
 * Schema für NEUE Eingaben aus dem Fragebogen (`POST /api/guide-requests`).
 *
 * Der Wizard prüft die Datumslogik bereits im Browser – die API ist aber
 * öffentlich und darf sich darauf nicht verlassen (Anforderung 4.1:
 * serverseitige Validierung). Ohne diese Prüfungen landen z. B.
 * `2026-02-31` (existiert nicht, wird still zum 3. März) oder ein Enddatum
 * vor dem Startdatum in der DB und erzeugen einen Guide mit falschem
 * Zeitraum bzw. einer auf 1 Tag zusammengefallenen Reise.
 */
export const questionnaireInputSchema = questionnaireSchema.superRefine((q, ctx) => {
  for (const field of ["dateFrom", "dateTo"] as const) {
    if (!isRealCalendarDate(q[field])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: "Kein gültiges Kalenderdatum.",
      });
      return;
    }
  }
  if (q.dateTo < q.dateFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dateTo"],
      message: "Das Enddatum liegt vor dem Startdatum.",
    });
    return;
  }
  const spanDays =
    Math.round(
      (Date.parse(`${q.dateTo}T00:00:00Z`) - Date.parse(`${q.dateFrom}T00:00:00Z`)) / 86_400_000
    ) + 1;
  if (spanDays > MAX_TRIP_DAYS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dateTo"],
      message: `Der Reisezeitraum darf höchstens ${MAX_TRIP_DAYS} Tage umfassen.`,
    });
  }
});

/**
 * Reisedauer in Tagen (inklusive An- und Abreisetag).
 * Bewusst in UTC gerechnet, damit Sommerzeit-Wechsel im Reisezeitraum die
 * Tageszahl nicht um eins verschieben.
 */
export function tripDays(q: Questionnaire): number {
  const from = Date.parse(`${q.dateFrom}T00:00:00Z`);
  const to = Date.parse(`${q.dateTo}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 1;
  const days = Math.round((to - from) / 86_400_000) + 1;
  return Math.max(1, Math.min(days, MAX_TRIP_DAYS));
}
