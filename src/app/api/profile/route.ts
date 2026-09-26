import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, settings } from "@/db/schema";
import { ensureProfile, jsonError, logAction } from "@/lib/server";

export async function GET() {
  try {
    const profile = await ensureProfile(); const [setting] = await db.select().from(settings).where(eq(settings.profileId, profile.id)).limit(1);
    return Response.json({ profile, settings: setting ?? null });
  } catch (error) { return jsonError(error, 500); }
}

export async function PATCH(request: Request) {
  try {
    const profile = await ensureProfile(); const body = await request.json();
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined && String(body.name).trim()) values.name = String(body.name).trim();
    if (body.email !== undefined) values.email = String(body.email).trim();
    if (body.username !== undefined && String(body.username).trim()) values.username = String(body.username).trim();
    const [updated] = await db.update(profiles).set(values).where(eq(profiles.id, profile.id)).returning();
    if (body.theme || body.currency || body.locale) await db.update(settings).set({ ...(body.theme ? { theme: body.theme } : {}), ...(body.currency ? { currency: body.currency } : {}), ...(body.locale ? { locale: body.locale } : {}), updatedAt: new Date() }).where(eq(settings.profileId, profile.id));
    await logAction(profile.id, "updated", "profile", profile.id); return Response.json(updated);
  } catch (error) { return jsonError(error); }
}
