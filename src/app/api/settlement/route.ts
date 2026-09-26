import { eq } from "drizzle-orm";
import { db } from "@/db";
import { personalSettlement } from "@/db/schema";
import { ensureProfile, jsonError, logAction, nonNegativeAmount } from "@/lib/server";

export async function GET() {
  try {
    const profile = await ensureProfile(); const [row] = await db.select().from(personalSettlement).where(eq(personalSettlement.profileId, profile.id)).limit(1);
    return Response.json(row ?? null);
  } catch (error) { return jsonError(error, 500); }
}

export async function PATCH(request: Request) {
  try {
    const profile = await ensureProfile(); const body = await request.json();
    const [current] = await db.select().from(personalSettlement).where(eq(personalSettlement.profileId, profile.id)).limit(1);
    if (!current) throw new Error("Configuração do acerto não encontrada.");
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.targetAmount !== undefined) values.targetAmount = body.targetAmount !== "" ? nonNegativeAmount(body.targetAmount) : "0";
    if (body.savedAmount !== undefined) values.savedAmount = body.savedAmount !== "" ? nonNegativeAmount(body.savedAmount) : "0";
    const [row] = await db.update(personalSettlement).set(values).where(eq(personalSettlement.id, current.id)).returning();
    await logAction(profile.id, "updated", "settlement", current.id); return Response.json(row);
  } catch (error) { return jsonError(error); }
}
