"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { INTERESTS, INTEREST_LABELS, type Interest } from "@/lib/questionnaire";

/**
 * Mehrstufiger Fragebogen-Wizard (Anforderung 4.1).
 * Fortschritt wird clientseitig gehalten; Absenden erzeugt einen GuideRequest.
 */

type InterestWeight = "wichtig" | "interessant";

interface FormState {
  dateFrom: string;
  dateTo: string;
  accommodation: string;
  anchors: string[];
  mobility: ("car" | "public" | "foot")[];
  adults: number;
  children: { ageGroup: "0-3" | "4-9" | "10-14" | "15-17" }[];
  occasion: string;
  interests: Partial<Record<Interest, InterestWeight>>;
  fitnessLevel: "niedrig" | "mittel" | "hoch";
  maxHikeDurationMin: number;
  maxElevationGainM: number;
  pace: "entspannt" | "ausgewogen" | "vollgepackt";
  priceLevel: number;
  diets: ("vegetarian" | "vegan" | "glutenfree")[];
  foodPreferences: ("regional_traditionell" | "gehoben" | "unkompliziert" | "aperitivo_bar")[];
  firstNames: string;
  gdprConsent: boolean;
}

const STEPS = ["Reise", "Reisende", "Interessen", "Aktivität", "Kulinarik", "Abschluss"];

const initialState: FormState = {
  dateFrom: "",
  dateTo: "",
  accommodation: "",
  anchors: [],
  mobility: ["car", "public"],
  adults: 2,
  children: [],
  occasion: "",
  interests: {},
  fitnessLevel: "mittel",
  maxHikeDurationMin: 240,
  maxElevationGainM: 800,
  pace: "ausgewogen",
  priceLevel: 3,
  diets: [],
  foodPreferences: [],
  firstNames: "",
  gdprConsent: false,
};

/**
 * Zwischenspeicher für den Wizard.
 *
 * Der Fragebogen hat sechs Schritte; ohne Speicherung kostet ein
 * versehentlicher Reload, ein Tab-Wechsel auf die Datenschutzerklärung oder
 * ein Handy, das den Tab entlädt, sämtliche Antworten. Bewusst
 * `localStorage` und kein Server: Die Daten sollen erst mit dem Absenden
 * (samt Einwilligung) das Gerät verlassen. Der Entwurf verfällt nach 7 Tagen
 * und wird nach erfolgreichem Absenden gelöscht.
 */
const DRAFT_KEY = "reisefuehrer:fragebogen:v1";
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function loadDraft(): { form: FormState; step: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; step?: number; form?: unknown };
    if (!parsed.savedAt || Date.now() - parsed.savedAt > DRAFT_MAX_AGE_MS) {
      window.localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    if (!parsed.form || typeof parsed.form !== "object") return null;
    // Über den Default mischen, damit später ergänzte Felder nicht fehlen.
    const form = { ...initialState, ...(parsed.form as Partial<FormState>) };
    const step = Math.min(Math.max(0, parsed.step ?? 0), STEPS.length - 1);
    return { form, step };
  } catch {
    // Defekter oder gesperrter Speicher: einfach frisch anfangen.
    return null;
  }
}

function saveDraft(form: FormState, step: number): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), step, form }));
  } catch {
    // Privater Modus / voller Speicher – kein Grund, den Wizard zu stören.
  }
}

function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* egal */
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 focus:border-(--color-accent) focus:outline-none";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm transition ${
        active
          ? "border-(--color-ink) bg-(--color-ink) text-white"
          : "border-neutral-300 bg-white hover:border-neutral-500"
      }`}
    >
      {children}
    </button>
  );
}

export default function FragebogenPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [restored, setRestored] = useState(false);
  // Erst nach dem Wiederherstellen speichern, sonst überschreibt der leere
  // Initialzustand beim ersten Render sofort den vorhandenen Entwurf.
  const hydrated = useRef(false);

  // Entwurf laden (nur im Browser, deshalb im Effekt statt im Initialwert –
  // sonst weicht das Server-Rendering vom Client ab).
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setForm(draft.form);
      setStep(draft.step);
      setRestored(true);
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    saveDraft(form, step);
  }, [form, step]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function startOver() {
    clearDraft();
    setForm(initialState);
    setStep(0);
    setRestored(false);
    setError(null);
  }

  function validateStep(): string | null {
    switch (step) {
      case 0:
        if (!form.dateFrom || !form.dateTo) return "Bitte gebt euren Reisezeitraum an.";
        if (form.dateTo < form.dateFrom) return "Das Enddatum liegt vor dem Startdatum.";
        if (!form.accommodation.trim()) return "Bitte gebt euren Unterkunftsort an.";
        if (form.mobility.length === 0) return "Bitte wählt mindestens ein Verkehrsmittel.";
        return null;
      case 2:
        if (Object.keys(form.interests).length === 0)
          return "Bitte wählt mindestens ein Interesse aus.";
        return null;
      case 5:
        if (!form.firstNames.trim()) return "Bitte gebt eure Vornamen an.";
        if (!form.gdprConsent) return "Bitte stimmt der Datenschutzerklärung zu.";
        return null;
      default:
        return null;
    }
  }

  function next() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function submit() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        regionSlug: "comer-see",
        dateFrom: form.dateFrom,
        dateTo: form.dateTo,
        accommodation: { label: form.accommodation, lat: null, lng: null },
        anchors: form.anchors
          .map((label) => label.trim())
          .filter(Boolean)
          .map((label) => ({ label, lat: null, lng: null })),
        mobility: form.mobility,
        adults: Math.min(20, Math.max(1, form.adults || 1)),
        children: form.children,
        occasion: form.occasion,
        interests: Object.entries(form.interests).map(([key, weight]) => ({ key, weight })),
        fitnessLevel: form.fitnessLevel,
        maxHikeDurationMin: form.maxHikeDurationMin,
        maxElevationGainM: form.maxElevationGainM,
        pace: form.pace,
        priceLevel: form.priceLevel,
        diets: form.diets,
        foodPreferences: form.foodPreferences,
        firstNames: form.firstNames,
        gdprConsent: form.gdprConsent,
      };
      const res = await fetch("/api/guide-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Etwas ist schiefgelaufen.");
      }
      // Abgeschickt: Entwurf hat seinen Zweck erfüllt und wird gelöscht,
      // damit keine personenbezogenen Angaben im Browser zurückbleiben.
      clearDraft();
      // Direkt in den Browser-Guide – dort füllt sich der Inhalt live
      router.push(data?.guideUrl ?? "/bestaetigung");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Etwas ist schiefgelaufen.");
      setSubmitting(false);
    }
  }

  function toggleInterest(key: Interest) {
    setForm((f) => {
      const current = f.interests[key];
      const interests = { ...f.interests };
      // Klick-Zyklus: aus -> interessant -> wichtig -> aus
      if (!current) interests[key] = "interessant";
      else if (current === "interessant") interests[key] = "wichtig";
      else delete interests[key];
      return { ...f, interests };
    });
  }

  function toggleArray<T>(arr: T[], value: T): T[] {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="mb-2 text-sm uppercase tracking-widest text-(--color-accent)">
        Euer Reiseführer · Comer See
      </p>
      <h1 className="font-serif text-3xl">Fragebogen</h1>

      {restored && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-(--color-accent-soft)/40 px-4 py-3 text-sm text-neutral-700">
          <span>Wir haben eure zuletzt begonnenen Antworten wiederhergestellt.</span>
          <button
            type="button"
            onClick={startOver}
            className="underline underline-offset-2 hover:text-(--color-ink)"
          >
            Neu beginnen
          </button>
        </div>
      )}

      {/* Fortschritt */}
      <ol className="mt-6 flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`rounded-full px-3 py-1 ${
              i === step
                ? "bg-(--color-ink) text-white"
                : i < step
                  ? "bg-(--color-accent-soft) text-(--color-ink)"
                  : "bg-neutral-200 text-neutral-500"
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="mt-8 space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        {step === 0 && (
          <>
            <Field label="Region">
              <input className={inputCls} value="Comer See (Italien)" disabled />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Anreise">
                <input
                  type="date"
                  className={inputCls}
                  value={form.dateFrom}
                  onChange={(e) => set("dateFrom", e.target.value)}
                />
              </Field>
              <Field label="Abreise">
                <input
                  type="date"
                  className={inputCls}
                  value={form.dateTo}
                  onChange={(e) => set("dateTo", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Unterkunftsort (Ort oder Adresse)">
              <input
                className={inputCls}
                placeholder="z. B. Varenna"
                value={form.accommodation}
                onChange={(e) => set("accommodation", e.target.value)}
              />
            </Field>
            <Field label="Weitere Wunsch-Orte (optional): zusätzliche Unterkünfte oder Must-Sees">
              <div className="space-y-2">
                {form.anchors.map((anchor, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className={inputCls}
                      placeholder="z. B. Torno, Bellagio, Villa Carlotta"
                      value={anchor}
                      onChange={(e) => {
                        const anchors = [...form.anchors];
                        anchors[i] = e.target.value;
                        set("anchors", anchors);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => set("anchors", form.anchors.filter((_, j) => j !== i))}
                      className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-500 hover:border-neutral-500"
                      aria-label="entfernen"
                    >
                      −
                    </button>
                  </div>
                ))}
                {form.anchors.length < 10 && (
                  <button
                    type="button"
                    onClick={() => set("anchors", [...form.anchors, ""])}
                    className="text-sm text-(--color-accent) underline"
                  >
                    + Ort hinzufügen
                  </button>
                )}
                <p className="text-xs text-neutral-500">
                  Um jeden dieser Orte herum ergänzen wir passende Tipps in der
                  Nähe – ideal, wenn ihr an mehreren Orten übernachtet oder etwas
                  Bestimmtes sehen wollt.
                </p>
              </div>
            </Field>
            <Field label="Wie seid ihr vor Ort unterwegs? (Mehrfachauswahl)">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["car", "Auto"],
                    ["public", "ÖPNV & Fähre"],
                    ["foot", "Zu Fuß / Rad"],
                  ] as const
                ).map(([value, label]) => (
                  <Chip
                    key={value}
                    active={form.mobility.includes(value)}
                    onClick={() => set("mobility", toggleArray(form.mobility, value))}
                  >
                    {label}
                  </Chip>
                ))}
              </div>
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field label="Anzahl Erwachsene">
              <input
                type="number"
                min={1}
                max={20}
                inputMode="numeric"
                className={inputCls}
                value={form.adults === 0 ? "" : form.adults}
                onChange={(e) => {
                  // Während des Tippens frei editierbar lassen (auch leeren);
                  // ein leeres Feld wird als 0 gehalten und beim Verlassen korrigiert.
                  const raw = e.target.value.replace(/[^0-9]/g, "");
                  set("adults", raw === "" ? 0 : Number(raw));
                }}
                onBlur={(e) => {
                  const n = Number(e.target.value) || 0;
                  set("adults", Math.min(20, Math.max(1, n)));
                }}
              />
            </Field>
            <Field label="Kinder">
              <div className="space-y-2">
                {form.children.map((child, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      className={inputCls}
                      value={child.ageGroup}
                      onChange={(e) => {
                        const children = [...form.children];
                        children[i] = { ageGroup: e.target.value as FormState["children"][number]["ageGroup"] };
                        set("children", children);
                      }}
                    >
                      <option value="0-3">0–3 Jahre</option>
                      <option value="4-9">4–9 Jahre</option>
                      <option value="10-14">10–14 Jahre</option>
                      <option value="15-17">15–17 Jahre</option>
                    </select>
                    <button
                      type="button"
                      className="text-sm text-neutral-500 hover:text-red-600"
                      onClick={() => set("children", form.children.filter((_, j) => j !== i))}
                    >
                      Entfernen
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-sm text-(--color-accent) hover:underline"
                  onClick={() => set("children", [...form.children, { ageGroup: "4-9" }])}
                >
                  + Kind hinzufügen
                </button>
              </div>
            </Field>
            <Field label="Besonderer Anlass (optional)">
              <input
                className={inputCls}
                placeholder="z. B. Hochzeitstag, runder Geburtstag"
                value={form.occasion}
                onChange={(e) => set("occasion", e.target.value)}
              />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm text-neutral-600">
              Was interessiert euch? Einmal klicken = <em>interessant</em>, zweimal ={" "}
              <em>wichtig</em>, dreimal = abwählen.
            </p>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((key) => {
                const weight = form.interests[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleInterest(key)}
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      weight === "wichtig"
                        ? "border-(--color-ink) bg-(--color-ink) text-white"
                        : weight === "interessant"
                          ? "border-(--color-accent) bg-(--color-accent-soft)"
                          : "border-neutral-300 bg-white hover:border-neutral-500"
                    }`}
                  >
                    {INTEREST_LABELS[key]}
                    {weight ? ` · ${weight}` : ""}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <Field label="Fitness-Level">
              <div className="flex gap-2">
                {(["niedrig", "mittel", "hoch"] as const).map((v) => (
                  <Chip key={v} active={form.fitnessLevel === v} onClick={() => set("fitnessLevel", v)}>
                    {v}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label={`Maximale Wanderdauer: ${Math.round(form.maxHikeDurationMin / 60 * 10) / 10} Std.`}>
              <input
                type="range"
                min={60}
                max={480}
                step={30}
                className="w-full"
                value={form.maxHikeDurationMin}
                onChange={(e) => set("maxHikeDurationMin", Number(e.target.value))}
              />
            </Field>
            <Field label={`Höhenmeter-Toleranz: ${form.maxElevationGainM} m`}>
              <input
                type="range"
                min={100}
                max={2000}
                step={100}
                className="w-full"
                value={form.maxElevationGainM}
                onChange={(e) => set("maxElevationGainM", Number(e.target.value))}
              />
            </Field>
            <Field label="Reisetempo">
              <div className="flex gap-2">
                {(["entspannt", "ausgewogen", "vollgepackt"] as const).map((v) => (
                  <Chip key={v} active={form.pace === v} onClick={() => set("pace", v)}>
                    {v}
                  </Chip>
                ))}
              </div>
            </Field>
          </>
        )}

        {step === 4 && (
          <>
            <Field label={`Preisniveau beim Essen: ${"€".repeat(form.priceLevel)}`}>
              <input
                type="range"
                min={1}
                max={4}
                className="w-full"
                value={form.priceLevel}
                onChange={(e) => set("priceLevel", Number(e.target.value))}
              />
            </Field>
            <Field label="Ernährungsweisen">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["vegetarian", "Vegetarisch"],
                    ["vegan", "Vegan"],
                    ["glutenfree", "Glutenfrei"],
                  ] as const
                ).map(([value, label]) => (
                  <Chip
                    key={value}
                    active={form.diets.includes(value)}
                    onClick={() => set("diets", toggleArray(form.diets, value))}
                  >
                    {label}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label="Was mögt ihr?">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["regional_traditionell", "Regional & traditionell"],
                    ["gehoben", "Gehoben"],
                    ["unkompliziert", "Unkompliziert"],
                    ["aperitivo_bar", "Aperitivo & Bar-Kultur"],
                  ] as const
                ).map(([value, label]) => (
                  <Chip
                    key={value}
                    active={form.foodPreferences.includes(value)}
                    onClick={() => set("foodPreferences", toggleArray(form.foodPreferences, value))}
                  >
                    {label}
                  </Chip>
                ))}
              </div>
            </Field>
          </>
        )}

        {step === 5 && (
          <>
            <Field label="Vorname(n) der Reisenden – für euer Cover">
              <input
                className={inputCls}
                placeholder="z. B. Anna & Jonas"
                value={form.firstNames}
                onChange={(e) => set("firstNames", e.target.value)}
              />
            </Field>
            <p className="rounded-lg bg-(--color-accent-soft)/30 px-4 py-3 text-sm text-neutral-600">
              Euren Reiseführer seht ihr gleich direkt im Browser. Eine E-Mail-Adresse
              zum Sichern des Links könnt ihr <strong>danach</strong> auf der Guide-Seite
              hinterlegen – ganz ohne Pflichtangabe vorab.
            </p>
            <label className="flex items-start gap-3 text-sm text-neutral-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.gdprConsent}
                onChange={(e) => set("gdprConsent", e.target.checked)}
              />
              <span>
                Ich willige ein, dass meine Angaben zur Erstellung des Reiseführers
                verarbeitet werden. Details in der{" "}
                <a href="/datenschutz" target="_blank" className="underline">
                  Datenschutzerklärung
                </a>
                . (Pflichtfeld)
              </span>
            </label>
          </>
        )}

        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <div className="flex justify-between pt-2">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-full px-6 py-3 text-neutral-600 disabled:opacity-40"
          >
            Zurück
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              className="rounded-full bg-(--color-ink) px-8 py-3 text-white transition hover:bg-(--color-accent)"
            >
              Weiter
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="rounded-full bg-(--color-accent) px-8 py-3 text-white transition hover:bg-(--color-ink) disabled:opacity-60"
            >
              {submitting ? "Wird gesendet ..." : "Reiseführer erstellen"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
