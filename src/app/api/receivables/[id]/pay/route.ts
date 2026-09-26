import { db } from "@/db";
import { ensureProfile, jsonError, logAction, moneyAdd, positiveAmount, safeCents } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Registra um recebimento: cria a movimentação de entrada, o pagamento e atualiza o saldo da conta. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const profile = await ensureProfile();
    const amount = positiveAmount(body.amount);
    if (!body.accountId) throw new Error("Escolha a conta onde o dinheiro entrou.");

    const result = await db.withTransaction(async (tx) => {
      const receivable = await tx.findOne("receivables", { id, profileId: profile.id });
      const account = await tx.findOne("accounts", { id: body.accountId, profileId: profile.id });
      if (!receivable || !account) throw new Error("Recebível ou conta não encontrado.");

      const payments = await tx.list("receivable_payments", { where: { receivableId: id } });
      const alreadyReceived = payments.reduce((total, payment) => total + safeCents(payment.amount), 0);
      if (safeCents(amount) > safeCents(receivable.originalAmount) - alreadyReceived) throw new Error("O pagamento não pode superar o valor restante.");

      const transaction = await tx.create("transactions", {
        profileId: profile.id,
        accountId: account.id,
        type: "income",
        amount,
        description: `Recebimento: ${receivable.person} — ${receivable.description}`,
        origin: body.origin === "gbr" ? "gbr" : "personal",
      });
      await tx.create("receivable_payments", {
        profileId: profile.id,
        receivableId: id,
        accountId: account.id,
        transactionId: transaction.id,
        amount,
      });
      await tx.update("accounts", account.id, { balance: moneyAdd(account.balance, amount), updatedAt: new Date() });

      const totalCents = alreadyReceived + safeCents(amount);
      await tx.update("receivables", id, {
        status: totalCents >= safeCents(receivable.originalAmount) ? "received" : "partial",
        updatedAt: new Date(),
      });
      return transaction;
    });

    await logAction(profile.id, "paid", "receivable", id, { amount });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
