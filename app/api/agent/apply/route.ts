import { getSession } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/client";
import { commitPatches } from "@/lib/config/version";
import { describePatch } from "@/lib/config/describe";
import { parsePatch, PatchError } from "@/lib/config/patch";
import { getCurrentVersion } from "@/lib/config/version";

export async function POST(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Sign in to continue.", { status: 401 });
  if (!session.canEditConfig) {
    return new Response("Your role cannot change this workspace's configuration.", { status: 403 });
  }

  const body = (await request.json()) as { patches?: unknown[] };
  if (!Array.isArray(body.patches) || body.patches.length === 0) {
    return new Response("There is nothing to apply.", { status: 400 });
  }

  try {
    const patches = body.patches.map(parsePatch);

    const version = await withTenant(session.tenantId, async (db) => {
      const current = await getCurrentVersion(db, session.tenantId);
      const summary =
        patches.length === 1
          ? describePatch(patches[0]!, current.config)
          : `${patches.length} configuration changes`;

      return commitPatches(db, session.tenantId, patches, "agent", summary);
    });

    return Response.json({ version: version.version, summary: version.summary });
  } catch (error) {
    if (error instanceof PatchError) return new Response(error.message, { status: 422 });
    console.error("apply failed:", error);
    return new Response("Those changes could not be applied.", { status: 500 });
  }
}
