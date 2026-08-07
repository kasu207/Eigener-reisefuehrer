"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Community-Seite: Nutzer schlagen Wissensquellen (Blogs, Artikel) vor.
 * So wächst die kuratierte Wissensdatenbank durch viele Beitragende –
 * jede Einreichung durchläuft Moderation + KI-Sicherheitsprüfung.
 */
export default function BeitragenPage() {
  const [form, setForm] = useState({ url: "", title: "", submitterName: "", note: "" });
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("sending");
    try {
      const res = await fetch("/api/knowledge-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regionSlug: "comer-see", ...form }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Etwas ist schiefgelaufen.");
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Etwas ist schiefgelaufen.");
      setState("idle");
    }
  }

  const inputCls =
    "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 focus:border-(--color-accent) focus:outline-none";

  return (
    <main id="inhalt" className="mx-auto max-w-2xl px-6 py-16">
      <p className="mb-2 text-sm uppercase tracking-widest text-(--color-accent)">Mitmachen</p>
      <h1 className="font-serif text-4xl">Teile deine besten Quellen zum Comer See</h1>
      <p className="mt-4 leading-relaxed text-neutral-700">
        Du kennst einen großartigen Blog-Artikel, ein Wanderportal oder einen
        Geheimtipp-Text? Schlag ihn hier vor. Unsere Redaktion prüft jede
        Einreichung, danach bereitet die KI die Inhalte als Wissens-Notizen auf –
        in eigenen Worten, mit Quellenangabe. So wird die Datenbank mit jeder
        Einreichung besser.
      </p>
      <p className="mt-3 rounded-xl bg-(--color-accent-soft)/40 px-4 py-3 text-sm text-neutral-700">
        Kuratiert heißt: Jede Quelle wird moderiert und automatisch geprüft.
        Jugendgefährdende, extremistische oder strafrechtlich relevante Inhalte
        werden abgelehnt und gelangen nie in die Datenbank.
      </p>

      {state === "done" ? (
        <div className="mt-10 rounded-2xl border border-green-300 bg-green-50 p-6">
          <h2 className="font-serif text-2xl">Danke für deinen Beitrag!</h2>
          <p className="mt-2 text-neutral-700">
            Deine Quelle liegt jetzt bei unserer Redaktion zur Prüfung. Nach der
            Freigabe fließt sie in zukünftige Reiseführer ein.
          </p>
          <Link href="/" className="mt-4 inline-block text-(--color-accent) underline">
            Zurück zur Startseite
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-10 space-y-4 rounded-2xl border border-neutral-200 bg-white p-6">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-700">Link zur Quelle *</span>
            <input
              type="url"
              required
              placeholder="https://..."
              className={inputCls}
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-700">Worum geht es? *</span>
            <input
              required
              maxLength={200}
              placeholder="z. B. Blogartikel über versteckte Badebuchten bei Lenno"
              className={inputCls}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-700">Dein Name (optional)</span>
            <input
              maxLength={100}
              className={inputCls}
              value={form.submitterName}
              onChange={(e) => setForm((f) => ({ ...f, submitterName: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-700">Hinweis für die Redaktion (optional)</span>
            <textarea
              rows={3}
              maxLength={500}
              className={inputCls}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </label>
          {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
          <button
            disabled={state === "sending"}
            className="rounded-full bg-(--color-ink) px-8 py-3 text-white transition hover:bg-(--color-accent) disabled:opacity-60"
          >
            {state === "sending" ? "Wird gesendet ..." : "Quelle einreichen"}
          </button>
        </form>
      )}
    </main>
  );
}
