import { db } from "@/db";
import { ensureProfile, findOwned, jsonError, logAction, parseDateOnly, positiveAmount } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profile = await ensureProfile();
    const body = await request.json();
    const current = await findOwned("debts", id, profile.id);
    if (!current) throw new Error("Dívida não encontrada.");

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) values.name = String(body.name).trim();
    if (body.creditor !== undefined) values.creditor = String(body.creditor).trim();
    if (body.category !== undefined) values.category = String(body.category);
    if (body.originalAmount !== undefined) values.originalAmount = positiveAmount(body.originalAmount);
    if (body.nextDueDate !== undefined) values.nextDueDate = parseDateOnly(body.nextDueDate) ?? null;
    if (body.note !== undefined) values.note = body.note ? String(body.note) : null;

    const row = await db.update("debts", id, values);
    await logAction(profile.id, "updated", "debt", id);
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
      const current = await tx.findOne("debts", { id, profileId: profile.id });
      if (!current) return null;
      const payments = await tx.list("debt_payments", { where: { debtId: id } });
      for (const payment of payments) await tx.remove("debt_payments", payment.id);
      return tx.remove("debts", id);
    });
    if (!removed) throw new Error("Dívida não encontrada.");
    await logAction(profile.id, "deleted", "debt", id);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
