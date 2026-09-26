import { db } from "@/db";
import { ensureProfile, jsonError, logAction, nonNegativeAmount } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await ensureProfile();
    const row = await db.findOne("personal_settlement", { profileId: profile.id });
    return Response.json(row ?? null);
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await ensureProfile();
    const body = await request.json();
    const current = await db.findOne("personal_settlement", { profileId: profile.id });
    if (!current) throw new Error("Configuração do acerto não encontrada.");

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.targetAmount !== undefined) values.targetAmount = body.targetAmount !== "" ? nonNegativeAmount(body.targetAmount) : "0.00";
    if (body.savedAmount !== undefined) values.savedAmount = body.savedAmount !== "" ? nonNegativeAmount(body.savedAmount) : "0.00";

    const row = await db.update("personal_settlement", current.id, values);
    await logAction(profile.id, "updated", "settlement", current.id);
    return Response.json(row ?? current);
  } catch (error) {
    return jsonError(error);
  }
}
