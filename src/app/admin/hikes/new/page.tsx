import { prisma } from "@/lib/db";
import HikeForm from "@/components/admin/HikeForm";
import { createHike } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewHikePage() {
  const regions = await prisma.region.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="max-w-2xl">
      <h2 className="mb-4 font-serif text-xl">Neue Wanderung</h2>
      <HikeForm regions={regions} action={createHike} submitLabel="Anlegen" />
    </div>
  );
}
