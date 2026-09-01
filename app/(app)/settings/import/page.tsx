import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getConfig } from "@/lib/config/version";
import { ImportScreen } from "./ImportScreen";

export default async function ImportPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const config = await getConfig(session.tenantId);

  return (
    <ImportScreen
      objects={config.objects.map((object) => ({
        key: object.key,
        label: object.label,
        labelPlural: object.labelPlural,
      }))}
    />
  );
}
