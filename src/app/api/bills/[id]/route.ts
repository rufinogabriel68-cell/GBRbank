import { db } from "@/db";
import { billStatuses } from "@/db/schema";
import { ensureProfile, findOwned, jsonError, logAction, parseDateOnly, positiveAmount } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profile = await ensureProfile();
    const body = await request.json();
    const current = await findOwned("bills", id, profile.id);
    if (!current) throw new Error("Conta não encontrada.");

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) values.name = String(body.name).trim();
    if (body.amount !== undefined) values.amount = positiveAmount(body.amount);
    if (body.dueDate !== undefined) values.dueDate = parseDateOnly(body.dueDate) ?? null;
    if (body.status && (billStatuses as readonly string[]).includes(body.status)) values.status = body.status;
    if (body.recurrence !== undefined) values.recurrence = String(body.recurrence);

    const row = await db.update("bills", id, values);
    await logAction(profile.id, "updated", "bill", id);
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
      const current = await tx.findOne("bills", { id, profileId: profile.id });
      if (!current) return null;
      return tx.remove("bills", id);
    });
    if (!removed) throw new Error("Conta não encontrada.");
    await logAction(profile.id, "deleted", "bill", id);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
