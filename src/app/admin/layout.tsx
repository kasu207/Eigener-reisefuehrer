import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between border-b border-neutral-300 pb-4">
        <h1 className="font-serif text-2xl">Redaktion</h1>
        <nav className="flex gap-5 text-sm">
          <Link href="/admin" className="hover:text-(--color-accent)">Guide-Requests</Link>
          <Link href="/admin/places" className="hover:text-(--color-accent)">Orte</Link>
          <Link href="/admin/hikes" className="hover:text-(--color-accent)">Wanderungen</Link>
          <Link href="/admin/regions" className="hover:text-(--color-accent)">Regionen</Link>
          <Link href="/admin/knowledge" className="hover:text-(--color-accent)">Wissensbibliothek</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
