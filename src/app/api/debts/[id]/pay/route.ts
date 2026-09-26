import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, debtPayments, debts, transactions } from "@/db/schema";
import { ensureProfile, jsonError, logAction, positiveAmount } from "@/lib/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const profile = await ensureProfile();
    const amount = positiveAmount(body.amount);
    if (!body.accountId) throw new Error("Escolha a conta de onde saiu o dinheiro.");
    const result = await db.transaction(async (tx) => {
      const [debt] = await tx.select().from(debts).where(and(eq(debts.id, id), eq(debts.profileId, profile.id))).limit(1);
      const [account] = await tx.select().from(accounts).where(and(eq(accounts.id, body.accountId), eq(accounts.profileId, profile.id))).limit(1);
      if (!debt || !account) throw new Error("Dívida ou conta não encontrada.");
      if (Number(account.balance) < Number(amount)) throw new Error("Saldo insuficiente na conta escolhida.");
      const payments = await tx.select().from(debtPayments).where(eq(debtPayments.debtId, id));
      const alreadyPaid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      if (Number(amount) > Number(debt.originalAmount) - alreadyPaid) throw new Error("O pagamento não pode superar o valor restante.");
      const [transaction] = await tx.insert(transactions).values({ profileId: profile.id, accountId: body.accountId, type: "expense", amount, description: `Pagamento: ${debt.name} — ${debt.creditor}`, origin: body.origin === "gbr" ? "gbr" : "personal" }).returning();
      await tx.insert(debtPayments).values({ profileId: profile.id, debtId: id, accountId: body.accountId, transactionId: transaction.id, amount });
      await tx.update(accounts).set({ balance: sql`${accounts.balance} - ${amount}`, updatedAt: new Date() }).where(eq(accounts.id, body.accountId));
      const total = alreadyPaid + Number(amount);
      await tx.update(debts).set({ status: total >= Number(debt.originalAmount) ? "paid" : "partial", updatedAt: new Date() }).where(eq(debts.id, id));
      return transaction;
    });
    await logAction(profile.id, "paid", "debt", id, { amount });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
