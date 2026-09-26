import { db } from "@/db";
import {
  ensureProfile,
  fromCents,
  jsonError,
  logAction,
  optionalDate,
  positiveAmount,
  safeCents,
} from "@/lib/server";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profile = await ensureProfile();

    const removed = await db.withTransaction(async (tx) => {
      const current = await tx.findOne("transactions", { id, profileId: profile.id });
      if (!current) throw new Error("Movimentação não encontrada.");
      if (current.type === "transfer") throw new Error("Exclua transferências pela origem para manter as contas consistentes.");

      const account = await tx.get("accounts", current.accountId);
      if (account) {
        const signed = current.type === "income" ? safeCents(current.amount) : -safeCents(current.amount);
        await tx.update("accounts", account.id, { balance: fromCents(safeCents(account.balance) - signed), updatedAt: new Date() });
      }
      await tx.remove("transactions", id);
      return current;
    });

    await logAction(profile.id, "deleted", "transaction", id, { amount: removed.amount });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profile = await ensureProfile();
    const body = await request.json();
    const current = await db.findOne("transactions", { id, profileId: profile.id });
    if (!current) throw new Error("Movimentação não encontrada.");
    if (current.type === "transfer") throw new Error("Transferência não é editável: exclua e lance novamente.");

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.description !== undefined) values.description = String(body.description);
    if (body.note !== undefined) values.note = body.note ? String(body.note) : null;
    if (body.occurredAt !== undefined) values.occurredAt = optionalDate(body.occurredAt) ?? null;
    if (body.origin !== undefined) values.origin = body.origin === "gbr" ? "gbr" : "personal";

    if (body.amount !== undefined) {
      const amount = positiveAmount(body.amount);
      const updated = await db.withTransaction(async (tx) => {
        const account = await tx.get("accounts", current.accountId);
        if (account) {
          const signedBefore = current.type === "income" ? safeCents(current.amount) : -safeCents(current.amount);
          const signedAfter = current.type === "income" ? safeCents(amount) : -safeCents(amount);
          const balance = fromCents(safeCents(account.balance) - signedBefore + signedAfter);
          await tx.update("accounts", account.id, { balance, updatedAt: new Date() });
        }
        return tx.update("transactions", id, { ...values, amount });
      });
      await logAction(profile.id, "updated", "transaction", id, { amount });
      return Response.json(updated ?? current);
    }

    const updated = await db.update("transactions", id, values);
    await logAction(profile.id, "updated", "transaction", id);
    return Response.json(updated ?? current);
  } catch (error) {
    return jsonError(error);
  }
}
