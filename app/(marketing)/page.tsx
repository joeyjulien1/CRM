import Link from "next/link";
import { HeroDemo } from "./HeroDemo";

export default function MarketingPage() {
  return (
    <main>
      <section className="mx-auto max-w-[1080px] px-3 py-6">
        {/* Line length stays under 80 characters, so the measure is capped. */}
        <h1 className="max-w-[16ch] text-2xl font-medium tracking-tight">
          Your CRM, configured by asking.
        </h1>
        <p className="mt-3 max-w-[60ch] text-base text-content-secondary">
          Describe how your team sells. The agent writes the configuration, shows you exactly what
          will change and what it costs, and applies it only when you say so. Every change is
          versioned, and every version rolls back.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href="/sign-up"
            className="rounded bg-accent px-4 py-3 text-sm text-accent-fg hover:bg-accent-hover"
          >
            Start a workspace
          </Link>
          <Link
            href="/sign-in"
            className="rounded border border-edge px-4 py-3 text-sm hover:bg-surface-hover"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-5">
          <HeroDemo />
        </div>
      </section>

      <section className="border-t border-edge">
        <div className="mx-auto grid max-w-[1080px] gap-4 px-3 py-6 md:grid-cols-3">
          <div>
            <h2 className="text-base font-medium">It changes settings, not code</h2>
            <p className="mt-2 max-w-[46ch] text-sm text-content-secondary">
              The agent can add a field, build a view, reshape a pipeline, or write an automation.
              It cannot write code, run queries, or read your customers&rsquo; records. That
              boundary is enforced, not promised.
            </p>
          </div>
          <div>
            <h2 className="text-base font-medium">Nothing happens until you agree</h2>
            <p className="mt-2 max-w-[46ch] text-sm text-content-secondary">
              Every change arrives as a plain-language summary. Anything destructive tells you how
              many records it would affect first, and anything that sends email or calls another
              service is confirmed separately.
            </p>
          </div>
          <div>
            <h2 className="text-base font-medium">Every version is kept</h2>
            <p className="mt-2 max-w-[46ch] text-sm text-content-secondary">
              Configuration is append-only. Rolling back writes the older setup forward as a new
              version, so you can undo a change from three weeks ago without losing the two you
              made since.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-edge">
        <div className="mx-auto max-w-[1080px] px-3 py-6">
          <h2 className="text-lg font-medium">What you get on day one</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="max-w-[60ch] text-sm text-content-secondary">
                Contacts, companies, deals and activities, each one yours to reshape. Tables you can
                edit in place, boards you can drag, filters you can save, and a command palette for
                people who would rather not touch the mouse.
              </p>
            </div>
            <div>
              <p className="max-w-[60ch] text-sm text-content-secondary">
                Upload a spreadsheet and watch it become a working CRM: columns are matched to
                fields, duplicates are merged on the key you choose, and the import runs in the
                background while you keep working. Connect Gmail and your mail lands on the right
                record.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-edge">
        <div className="mx-auto max-w-[1080px] px-3 py-6">
          <h2 className="text-lg font-medium">Start with your own spreadsheet</h2>
          <p className="mt-2 max-w-[60ch] text-sm text-content-secondary">
            It takes about five minutes to find out whether this fits how you sell.
          </p>
          <Link
            href="/sign-up"
            className="mt-4 inline-block rounded bg-accent px-4 py-3 text-sm text-accent-fg hover:bg-accent-hover"
          >
            Start a workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
