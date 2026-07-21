import type { RegionInfo } from "@prisma/client";

/**
 * Rendert einen "Gut zu wissen"-Abschnitt je nach Format:
 * - prose: Fließtext
 * - table: Zeilen "a | b" (z. B. Sprachführer als Tabelle)
 * - timeline: Zeilen "Jahr | Ereignis | optionaler Side-Fact" (Geschichte
 *   mit Chronologie und witzigen Side-Facts)
 */
export default function RegionInfoBlock({ info }: { info: RegionInfo }) {
  const lines = info.content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (info.format === "table") {
    const rows = lines.map((l) => l.split("|").map((c) => c.trim()));
    return (
      <article className="print-avoid-break border-t border-neutral-200 pt-4">
        <h3 className="font-serif text-xl">{info.title}</h3>
        <table className="mt-3 w-full border-collapse text-sm">
          <tbody>
            {rows.map((cells, i) => (
              <tr key={i} className="border-b border-neutral-100">
                <td className="w-1/2 py-1.5 pr-4 font-medium">{cells[0]}</td>
                <td className="py-1.5 text-neutral-700">{cells.slice(1).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    );
  }

  if (info.format === "timeline") {
    const events = lines.map((l) => {
      const [year, event, sidefact] = l.split("|").map((c) => c.trim());
      return { year, event, sidefact };
    });
    return (
      <article className="print-avoid-break border-t border-neutral-200 pt-4">
        <h3 className="font-serif text-xl">{info.title}</h3>
        <ol className="mt-4 space-y-4">
          {events.map((e, i) => (
            <li key={i} className="print-avoid-break flex gap-4">
              <span className="w-20 shrink-0 font-serif text-lg text-(--color-accent)">
                {e.year}
              </span>
              <div>
                <p className="leading-relaxed">{e.event}</p>
                {e.sidefact && (
                  <p className="mt-1 rounded-lg bg-(--color-accent-soft)/40 px-3 py-1.5 text-sm italic text-neutral-700">
                    Kurios: {e.sidefact}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </article>
    );
  }

  return (
    <article className="print-avoid-break border-t border-neutral-200 pt-4">
      <h3 className="font-serif text-xl">{info.title}</h3>
      <p className="mt-2 leading-relaxed whitespace-pre-line">{info.content}</p>
    </article>
  );
}
