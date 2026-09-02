import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/client";
import { getHistory } from "@/lib/config/version";
import { describePatches } from "@/lib/config/describe";
import { authorLabel } from "@/lib/templates";
import { RollbackButton } from "./RollbackButton";

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const versions = await withTenant(session.tenantId, (db) => getHistory(db, session.tenantId, 20));
  const current = versions[0];

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <h1 className="mb-1 text-sm font-medium">Configuration history</h1>
      <p className="mb-5 text-xs text-content-secondary">
        Every change is a version. Rolling back writes the older configuration forward as a new version, so
        nothing is ever lost.
      </p>

      {/* A patch is described against the configuration it changed — the
          version before it — so "removes the New stage" names the stage that
          was there, not the one that replaced it. */}
      <ol className="flex flex-col gap-3">
        {versions.map((version, index) => (
          <li key={version.id} className="rounded border border-edge px-4 py-3">
            <div className="flex items-baseline justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm">
                  {version.summary}
                  {version.version === current?.version ? (
                    <span className="ml-2 text-xs text-content-muted">current</span>
                  ) : null}
                </p>
                <p className="text-xs text-content-muted">
                  Version {version.version} · {authorLabel(version.author)} ·{" "}
                  {new Date(version.createdAt).toLocaleString()}
                </p>
              </div>

              {version.version !== current?.version && session.canEditConfig ? (
                <RollbackButton version={version.version} />
              ) : null}
            </div>

            {version.patch.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1">
                {describePatches(
                  version.patch,
                  versions[index + 1]?.config ?? version.config,
                ).map((line, patchIndex) => (
                  <li key={patchIndex} className="text-xs text-content-secondary">
                    {line}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
