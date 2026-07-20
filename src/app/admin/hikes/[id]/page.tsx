import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import HikeForm from "@/components/admin/HikeForm";
import {
  updateHike,
  deleteHike,
  addImage,
  deleteImage,
  addSource,
  deleteSource,
  importSourceFromUrl,
} from "../../actions";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded border border-neutral-300 px-2 py-1 text-sm";

export default async function EditHikePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hike = await prisma.hike.findUnique({
    where: { id },
    include: { images: true, sources: { orderBy: { fetchedAt: "desc" } } },
  });
  if (!hike) notFound();
  const regions = await prisma.region.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <h2 className="mb-4 font-serif text-xl">Wanderung bearbeiten: {hike.name}</h2>
        <HikeForm hike={hike} regions={regions} action={updateHike} submitLabel="Speichern" />
        <form action={deleteHike} className="mt-4">
          <input type="hidden" name="id" value={hike.id} />
          <button className="text-sm text-red-700 underline">Wanderung löschen</button>
        </form>
      </div>

      <div className="space-y-8">
        <section>
          <h3 className="mb-2 font-serif text-lg">Bilder</h3>
          <ul className="space-y-2 text-sm">
            {hike.images.map((img) => (
              <li key={img.id} className="rounded border border-neutral-200 bg-white p-3">
                <a href={img.fileUrl} target="_blank" className="break-all text-(--color-accent) underline">
                  {img.fileUrl}
                </a>
                <p className="text-xs text-neutral-500">
                  {img.author} · {img.license}
                </p>
                <form action={deleteImage}>
                  <input type="hidden" name="id" value={img.id} />
                  <button className="text-xs text-red-700 underline">Entfernen</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addImage} className="mt-3 space-y-2 rounded border border-neutral-200 bg-white p-3">
            <input type="hidden" name="hikeId" value={hike.id} />
            <input name="fileUrl" placeholder="Bild-URL" className={inputCls} required />
            <div className="grid grid-cols-2 gap-2">
              <input name="license" placeholder="Lizenz" className={inputCls} required />
              <input name="author" placeholder="Urheber" className={inputCls} required />
            </div>
            <input name="sourceUrl" placeholder="Quelllink" className={inputCls} required />
            <button className="rounded bg-(--color-ink) px-3 py-1.5 text-xs text-white">Bild hinzufügen</button>
          </form>
        </section>

        <section>
          <h3 className="mb-2 font-serif text-lg">Quellen</h3>
          <ul className="space-y-2 text-sm">
            {hike.sources.map((src) => (
              <li key={src.id} className="rounded border border-neutral-200 bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-neutral-400">{src.sourceType}</p>
                <a href={src.url} target="_blank" className="break-all text-(--color-accent) underline">
                  {src.url}
                </a>
                {src.excerpt && <p className="mt-1 text-xs text-neutral-600">{src.excerpt}</p>}
                <form action={deleteSource}>
                  <input type="hidden" name="id" value={src.id} />
                  <button className="text-xs text-red-700 underline">Entfernen</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addSource} className="mt-3 space-y-2 rounded border border-neutral-200 bg-white p-3">
            <input type="hidden" name="hikeId" value={hike.id} />
            <input name="url" placeholder="URL" className={inputCls} required />
            <select name="sourceType" className={inputCls}>
              <option value="portal">Wanderportal</option>
              <option value="blog">Blog</option>
              <option value="reddit">Reddit</option>
              <option value="own">Eigene Aufzeichnung</option>
            </select>
            <textarea name="excerpt" placeholder="Exzerpt / Notiz" className={inputCls} rows={2} />
            <button className="rounded bg-(--color-ink) px-3 py-1.5 text-xs text-white">Quelle hinzufügen</button>
          </form>
          <form action={importSourceFromUrl} className="mt-3 space-y-2 rounded border border-neutral-200 bg-white p-3">
            <p className="text-xs font-medium text-neutral-600">URL-Import (Titel & Kernaussagen)</p>
            <input type="hidden" name="hikeId" value={hike.id} />
            <input name="url" placeholder="https:// Portal- oder Blog-URL" className={inputCls} required />
            <button className="rounded bg-(--color-accent) px-3 py-1.5 text-xs text-white">Importieren</button>
          </form>
        </section>
      </div>
    </div>
  );
}
