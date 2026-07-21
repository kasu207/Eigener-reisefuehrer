import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import PlaceForm from "@/components/admin/PlaceForm";
import ImageSearch from "@/components/ImageSearch";
import {
  updatePlace,
  deletePlace,
  addImage,
  deleteImage,
  addSource,
  deleteSource,
  importSourceFromUrl,
  importRedditSources,
} from "../../actions";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded border border-neutral-300 px-2 py-1 text-sm";

export default async function EditPlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const place = await prisma.place.findUnique({
    where: { id },
    include: { images: true, sources: { orderBy: { fetchedAt: "desc" } } },
  });
  if (!place) notFound();
  const regions = await prisma.region.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <h2 className="mb-4 font-serif text-xl">Ort bearbeiten: {place.name}</h2>
        <PlaceForm place={place} regions={regions} action={updatePlace} submitLabel="Speichern" />
        <form action={deletePlace} className="mt-4">
          <input type="hidden" name="id" value={place.id} />
          <button className="text-sm text-red-700 underline">Ort löschen</button>
        </form>
      </div>

      <div className="space-y-8">
        {/* Bilder (Anforderung 5.2: nur mit klarer Lizenz) */}
        <section>
          <h3 className="mb-2 font-serif text-lg">Bilder</h3>
          <ul className="space-y-2 text-sm">
            {place.images.map((img) => (
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
          <div className="mt-3">
            <ImageSearch placeId={place.id} defaultQuery={`${place.name} ${place.locality}`.trim()} />
          </div>
          <p className="mt-4 mb-1 text-xs font-medium text-neutral-500">oder manuell hinzufügen</p>
          <form action={addImage} className="space-y-2 rounded border border-neutral-200 bg-white p-3">
            <input type="hidden" name="placeId" value={place.id} />
            <input name="fileUrl" placeholder="Bild-URL (Wikimedia/Unsplash/Pexels/eigen)" className={inputCls} required />
            <div className="grid grid-cols-2 gap-2">
              <input name="license" placeholder="Lizenz (z. B. CC BY-SA 4.0)" className={inputCls} required />
              <input name="author" placeholder="Urheber" className={inputCls} required />
            </div>
            <input name="sourceUrl" placeholder="Quelllink" className={inputCls} required />
            <button className="rounded bg-(--color-ink) px-3 py-1.5 text-xs text-white">Bild hinzufügen</button>
          </form>
        </section>

        {/* Quellen (Anforderung 5.1/5.3) */}
        <section>
          <h3 className="mb-2 font-serif text-lg">Quellen</h3>
          <ul className="space-y-2 text-sm">
            {place.sources.map((src) => (
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
            <p className="text-xs font-medium text-neutral-600">Quelle manuell erfassen (auch Instagram-Recherche)</p>
            <input type="hidden" name="placeId" value={place.id} />
            <input name="url" placeholder="URL (bei Instagram: Profil-Link)" className={inputCls} required />
            <select name="sourceType" className={inputCls}>
              <option value="blog">Blog</option>
              <option value="reddit">Reddit</option>
              <option value="portal">Wanderportal</option>
              <option value="instagram">Instagram (manuelle Recherche)</option>
              <option value="own">Eigene Recherche</option>
            </select>
            <textarea name="excerpt" placeholder="Exzerpt / redaktionelle Notiz" className={inputCls} rows={2} />
            <button className="rounded bg-(--color-ink) px-3 py-1.5 text-xs text-white">Quelle hinzufügen</button>
          </form>

          <form action={importSourceFromUrl} className="mt-3 space-y-2 rounded border border-neutral-200 bg-white p-3">
            <p className="text-xs font-medium text-neutral-600">URL-Import: Titel & Kernaussagen automatisch holen</p>
            <input type="hidden" name="placeId" value={place.id} />
            <input name="url" placeholder="https:// Blog- oder Portal-URL" className={inputCls} required />
            <button className="rounded bg-(--color-accent) px-3 py-1.5 text-xs text-white">Importieren</button>
          </form>

          <form action={importRedditSources} className="mt-3 space-y-2 rounded border border-neutral-200 bg-white p-3">
            <p className="text-xs font-medium text-neutral-600">
              Reddit-Suche: legt bis zu 5 Thread-Vorschläge als Quellen an (bitte danach prüfen)
            </p>
            <input type="hidden" name="placeId" value={place.id} />
            <input name="query" defaultValue={`${place.name} Lake Como`} className={inputCls} required />
            <button className="rounded bg-(--color-accent) px-3 py-1.5 text-xs text-white">Threads suchen</button>
          </form>
        </section>
      </div>
    </div>
  );
}
