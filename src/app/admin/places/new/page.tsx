import { prisma } from "@/lib/db";
import PlaceForm from "@/components/admin/PlaceForm";
import { createPlace } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewPlacePage() {
  const regions = await prisma.region.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="max-w-2xl">
      <h2 className="mb-4 font-serif text-xl">Neuer Ort</h2>
      <PlaceForm regions={regions} action={createPlace} submitLabel="Anlegen" />
    </div>
  );
}
