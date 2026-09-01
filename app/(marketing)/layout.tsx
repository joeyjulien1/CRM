import Link from "next/link";

/**
 * The site shares the app's colour, type family, radius, border weight, and
 * motion, and forks only spacing and type scale — see docs/DESIGN.md.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-density="site" className="min-h-screen bg-surface text-content">
      <header className="border-b border-edge">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between px-3 py-2">
          <Link href="/" className="text-sm font-medium">
            CRM
          </Link>
          <nav className="flex items-center gap-3 text-xs" aria-label="Main">
            <Link href="/sign-in" className="text-content-secondary hover:text-content">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded bg-accent px-3 py-2 text-accent-fg hover:bg-accent-hover"
            >
              Start a workspace
            </Link>
          </nav>
        </div>
      </header>

      {children}

      <footer className="border-t border-edge">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-2 px-3 py-4 text-xs text-content-secondary">
          <p>A CRM you configure by talking to it.</p>
          <p>Contacts, companies, deals, activities. One mailbox integration.</p>
        </div>
      </footer>
    </div>
  );
}
