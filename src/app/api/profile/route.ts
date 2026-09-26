import { db } from "@/db";
import { ensureProfile, jsonError, logAction } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await ensureProfile();
    const settings = await db.findOne("settings", { profileId: profile.id });
    return Response.json({ profile, settings: settings ?? null, database: db.info() });
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await ensureProfile();
    const body = await request.json();

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined && String(body.name).trim()) values.name = String(body.name).trim();
    if (body.email !== undefined) values.email = String(body.email).trim();
    if (body.username !== undefined && String(body.username).trim()) values.username = String(body.username).trim();

    const updated = await db.update("profiles", profile.id, values);

    if (body.theme || body.currency || body.locale) {
      const settings = await db.findOne("settings", { profileId: profile.id });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (body.theme) patch.theme = String(body.theme);
      if (body.currency) patch.currency = String(body.currency);
      if (body.locale) patch.locale = String(body.locale);
      if (settings) await db.update("settings", settings.id, patch);
      else await db.create("settings", { profileId: profile.id, ...patch });
    }

    await logAction(profile.id, "updated", "profile", profile.id);
    return Response.json(updated ?? profile);
  } catch (error) {
    return jsonError(error);
  }
}
