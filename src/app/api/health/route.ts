import { db } from "@/db";
import { DEFAULT_PROFILE_ID } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const info = db.info();
  try {
    await db.get("profiles", DEFAULT_PROFILE_ID);
    return Response.json({
      ok: true,
      service: "gbr-bank",
      database: "connected",
      mode: info.mode,
      label: info.label,
      projectId: info.projectId,
      persistent: info.persistent,
      warning: info.warning,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        service: "gbr-bank",
        database: "unavailable",
        mode: info.mode,
        label: info.label,
        projectId: info.projectId,
        error: error instanceof Error ? error.message : "Falha desconhecida",
      },
      { status: 503 },
    );
  }
}
