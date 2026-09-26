import { db } from "@/db";
import { ensureProfile, findOwned, jsonError, logAction, parseDateOnly, positiveAmount } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profile = await ensureProfile();
    const body = await request.json();
    const current = await findOwned("goals", id, profile.id);
    if (!current) throw new Error("Meta não encontrada.");

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) values.name = String(body.name).trim();
    if (body.targetAmount !== undefined) values.targetAmount = positiveAmount(body.targetAmount);
    if (body.currentAmount !== undefined) values.currentAmount = body.currentAmount ? positiveAmount(body.currentAmount) : "0.00";
    if (body.deadline !== undefined) values.deadline = parseDateOnly(body.deadline) ?? null;
    if (body.category !== undefined) values.category = String(body.category);
    if (body.note !== undefined) values.note = body.note ? String(body.note) : null;

    const row = await db.update("goals", id, values);
    await logAction(profile.id, "updated", "goal", id);
    return Response.json(row ?? current);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profile = await ensureProfile();
    const removed = await db.withTransaction(async (tx) => {
      const current = await tx.findOne("goals", { id, profileId: profile.id });
      if (!current) return null;
      return tx.remove("goals", id);
    });
    if (!removed) throw new Error("Meta não encontrada.");
    await logAction(profile.id, "deleted", "goal", id);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
