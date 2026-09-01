import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getConfig } from "@/lib/config/version";

export default async function AppIndex() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const config = await getConfig(session.tenantId);
  const first = config.views[0];
  redirect(first ? `/views/${first.id}` : "/settings/history");
}
