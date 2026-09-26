import { db } from "@/db";
import {
  ensureProfile,
  jsonError,
  logAction,
  moneyGreaterOrEqual,
  moneySub,
  positiveAmount,
  safeCents,
} from "@/lib/server";

export const dynamic = "force-dynamic";

/** Registra o pagamento de uma dívida: saída da conta, pagamento e atualização do status. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const profile = await ensureProfile();
    const amount = positiveAmount(body.amount);
    if (!body.accountId) throw new Error("Escolha a conta de onde saiu o dinheiro.");

    const result = await db.withTransaction(async (tx) => {
      const debt = await tx.findOne("debts", { id, profileId: profile.id });
      const account = await tx.findOne("accounts", { id: body.accountId, profileId: profile.id });
      if (!debt || !account) throw new Error("Dívida ou conta não encontrada.");
      if (!moneyGreaterOrEqual(account.balance, amount)) throw new Error("Saldo insuficiente na conta escolhida.");

      const payments = await tx.list("debt_payments", { where: { debtId: id } });
      const alreadyPaid = payments.reduce((total, payment) => total + safeCents(payment.amount), 0);
      if (safeCents(amount) > safeCents(debt.originalAmount) - alreadyPaid) throw new Error("O pagamento não pode superar o valor restante.");

      const transaction = await tx.create("transactions", {
        profileId: profile.id,
        accountId: account.id,
        type: "expense",
        amount,
        description: `Pagamento: ${debt.name} — ${debt.creditor}`,
        origin: body.origin === "gbr" ? "gbr" : "personal",
      });
      await tx.create("debt_payments", {
        profileId: profile.id,
        debtId: id,
        accountId: account.id,
        transactionId: transaction.id,
        amount,
      });
      await tx.update("accounts", account.id, { balance: moneySub(account.balance, amount), updatedAt: new Date() });

      const totalCents = alreadyPaid + safeCents(amount);
      await tx.update("debts", id, {
        status: totalCents >= safeCents(debt.originalAmount) ? "paid" : "partial",
        updatedAt: new Date(),
      });
      return transaction;
    });

    await logAction(profile.id, "paid", "debt", id, { amount });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
