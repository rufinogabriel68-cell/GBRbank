import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, receivablePayments, receivables, transactions } from "@/db/schema";
import { ensureProfile, jsonError, logAction, positiveAmount } from "@/lib/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const profile = await ensureProfile();
    const amount = positiveAmount(body.amount);
    if (!body.accountId) throw new Error("Escolha a conta onde o dinheiro entrou.");
    const result = await db.transaction(async (tx) => {
      const [receivable] = await tx.select().from(receivables).where(and(eq(receivables.id, id), eq(receivables.profileId, profile.id))).limit(1);
      const [account] = await tx.select().from(accounts).where(and(eq(accounts.id, body.accountId), eq(accounts.profileId, profile.id))).limit(1);
      if (!receivable || !account) throw new Error("Recebível ou conta não encontrado.");
      const payments = await tx.select().from(receivablePayments).where(eq(receivablePayments.receivableId, id));
      const alreadyReceived = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      if (Number(amount) > Number(receivable.originalAmount) - alreadyReceived) throw new Error("O pagamento não pode superar o valor restante.");
      const [transaction] = await tx.insert(transactions).values({ profileId: profile.id, accountId: body.accountId, type: "income", amount, description: `Recebimento: ${receivable.person} — ${receivable.description}`, origin: body.origin === "gbr" ? "gbr" : "personal" }).returning();
      await tx.insert(receivablePayments).values({ profileId: profile.id, receivableId: id, accountId: body.accountId, transactionId: transaction.id, amount });
      await tx.update(accounts).set({ balance: sql`${accounts.balance} + ${amount}`, updatedAt: new Date() }).where(eq(accounts.id, body.accountId));
      const total = alreadyReceived + Number(amount);
      await tx.update(receivables).set({ status: total >= Number(receivable.originalAmount) ? "received" : "partial", updatedAt: new Date() }).where(eq(receivables.id, id));
      return transaction;
    });
    await logAction(profile.id, "paid", "receivable", id, { amount });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
