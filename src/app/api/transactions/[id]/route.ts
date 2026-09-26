import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, transactions } from "@/db/schema";
import { ensureProfile, jsonError, logAction, optionalDate, positiveAmount } from "@/lib/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profile = await ensureProfile();
    await db.transaction(async (tx) => {
      const found = await tx.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.profileId, profile.id))).limit(1);
      if (!found[0]) throw new Error("Movimentação não encontrada.");
      if (found[0].type === "transfer") throw new Error("Exclua transferências pela origem para manter as contas consistentes.");
      const delta = found[0].type === "income" ? sql`${accounts.balance} - ${found[0].amount}` : sql`${accounts.balance} + ${found[0].amount}`;
      await tx.update(accounts).set({ balance: delta, updatedAt: new Date() }).where(eq(accounts.id, found[0].accountId));
      await tx.delete(transactions).where(eq(transactions.id, id));
    });
    await logAction(profile.id, "deleted", "transaction", id);
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
    const [current] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.profileId, profile.id))).limit(1);
    if (!current || current.type === "transfer") throw new Error("Movimentação não encontrada ou transferência não editável.");
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.description !== undefined) values.description = String(body.description);
    if (body.note !== undefined) values.note = body.note ? String(body.note) : null;
    if (body.occurredAt !== undefined) values.occurredAt = optionalDate(body.occurredAt);
    if (body.amount !== undefined) {
      const amount = positiveAmount(body.amount);
      await db.transaction(async (tx) => {
        const oldDelta = current.type === "income" ? sql`${accounts.balance} - ${current.amount}` : sql`${accounts.balance} + ${current.amount}`;
        const newDelta = current.type === "income" ? sql`${accounts.balance} + ${amount}` : sql`${accounts.balance} - ${amount}`;
        await tx.update(accounts).set({ balance: oldDelta, updatedAt: new Date() }).where(eq(accounts.id, current.accountId));
        await tx.update(accounts).set({ balance: newDelta, updatedAt: new Date() }).where(eq(accounts.id, current.accountId));
        await tx.update(transactions).set({ ...values, amount }).where(eq(transactions.id, id));
      });
    } else {
      await db.update(transactions).set(values).where(eq(transactions.id, id));
    }
    await logAction(profile.id, "updated", "transaction", id);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
