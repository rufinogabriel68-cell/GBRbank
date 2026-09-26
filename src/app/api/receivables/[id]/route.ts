import { db } from "@/db";
import { ensureProfile, findOwned, jsonError, logAction, parseDateOnly, positiveAmount } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profile = await ensureProfile();
    const body = await request.json();
    const current = await findOwned("receivables", id, profile.id);
    if (!current) throw new Error("Valor a receber não encontrado.");

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.person !== undefined) values.person = String(body.person).trim();
    if (body.description !== undefined) values.description = String(body.description).trim();
    if (body.originalAmount !== undefined) values.originalAmount = positiveAmount(body.originalAmount);
    if (body.dueDate !== undefined) values.dueDate = parseDateOnly(body.dueDate) ?? null;
    if (body.note !== undefined) values.note = body.note ? String(body.note) : null;

    const row = await db.update("receivables", id, values);
    await logAction(profile.id, "updated", "receivable", id);
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
      const current = await tx.findOne("receivables", { id, profileId: profile.id });
      if (!current) return null;
      const payments = await tx.list("receivable_payments", { where: { receivableId: id } });
      for (const payment of payments) await tx.remove("receivable_payments", payment.id);
      return tx.remove("receivables", id);
    });
    if (!removed) throw new Error("Valor a receber não encontrado.");
    await logAction(profile.id, "deleted", "receivable", id);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
