import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, bills, categories, debts, debtPayments, goals, personalSettlement, profiles, receivablePayments, receivables, settings, transactions } from "@/db/schema";
import { ensureProfile, jsonError, moneyNumber } from "@/lib/server";

export const dynamic = "force-dynamic";

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function isSameDay(value: Date, reference: Date) {
  return dayKey(value) === dayKey(reference);
}

function isSameMonth(value: Date, reference: Date) {
  return value.getUTCFullYear() === reference.getUTCFullYear() && value.getUTCMonth() === reference.getUTCMonth();
}

export async function GET() {
  try {
    const profile = await ensureProfile();
    const [accountRows, categoryRows, transactionRows, receivableRows, receivablePaymentRows, debtRows, debtPaymentRows, billRows, goalRows, settlementRows, settingRows] = await Promise.all([
      db.select().from(accounts).where(eq(accounts.profileId, profile.id)).orderBy(desc(accounts.createdAt)),
      db.select().from(categories).where(eq(categories.profileId, profile.id)),
      db.select().from(transactions).where(eq(transactions.profileId, profile.id)).orderBy(desc(transactions.occurredAt)).limit(500),
      db.select().from(receivables).where(eq(receivables.profileId, profile.id)).orderBy(desc(receivables.dueDate)),
      db.select().from(receivablePayments).where(eq(receivablePayments.profileId, profile.id)),
      db.select().from(debts).where(eq(debts.profileId, profile.id)).orderBy(desc(debts.nextDueDate)),
      db.select().from(debtPayments).where(eq(debtPayments.profileId, profile.id)),
      db.select().from(bills).where(eq(bills.profileId, profile.id)).orderBy(bills.dueDate),
      db.select().from(goals).where(eq(goals.profileId, profile.id)).orderBy(desc(goals.createdAt)),
      db.select().from(personalSettlement).where(eq(personalSettlement.profileId, profile.id)).limit(1),
      db.select().from(settings).where(eq(settings.profileId, profile.id)).limit(1),
    ]);

    const today = new Date();
    const receivedById = new Map<string, number>();
    receivablePaymentRows.forEach((row) => receivedById.set(row.receivableId, (receivedById.get(row.receivableId) ?? 0) + moneyNumber(row.amount)));
    const paidById = new Map<string, number>();
    debtPaymentRows.forEach((row) => paidById.set(row.debtId, (paidById.get(row.debtId) ?? 0) + moneyNumber(row.amount)));

    const receivablesWithTotals = receivableRows.map((row) => {
      const received = receivedById.get(row.id) ?? 0;
      const remaining = Math.max(0, moneyNumber(row.originalAmount) - received);
      const overdue = Boolean(row.dueDate && row.dueDate < dayKey(today) && remaining > 0);
      return { ...row, receivedAmount: received, remainingAmount: remaining, computedStatus: overdue ? "overdue" : remaining <= 0 ? "received" : received > 0 ? "partial" : row.status };
    });
    const debtsWithTotals = debtRows.map((row) => {
      const paid = paidById.get(row.id) ?? 0;
      const remaining = Math.max(0, moneyNumber(row.originalAmount) - paid);
      const overdue = Boolean(row.nextDueDate && row.nextDueDate < dayKey(today) && remaining > 0);
      return { ...row, paidAmount: paid, remainingAmount: remaining, computedStatus: overdue ? "overdue" : remaining <= 0 ? "paid" : paid > 0 ? "partial" : row.status };
    });

    const available = accountRows.filter((row) => row.status === "active").reduce((sum, row) => sum + moneyNumber(row.balance), 0);
    const toReceive = receivablesWithTotals.reduce((sum, row) => sum + row.remainingAmount, 0);
    const debtTotal = debtsWithTotals.reduce((sum, row) => sum + row.remainingAmount, 0);
    const todayIncome = transactionRows.filter((row) => row.type === "income" && isSameDay(new Date(row.occurredAt), today)).reduce((sum, row) => sum + moneyNumber(row.amount), 0);
    const todayExpense = transactionRows.filter((row) => row.type === "expense" && isSameDay(new Date(row.occurredAt), today)).reduce((sum, row) => sum + moneyNumber(row.amount), 0);
    const monthIncome = transactionRows.filter((row) => row.type === "income" && isSameMonth(new Date(row.occurredAt), today)).reduce((sum, row) => sum + moneyNumber(row.amount), 0);
    const monthExpense = transactionRows.filter((row) => row.type === "expense" && isSameMonth(new Date(row.occurredAt), today)).reduce((sum, row) => sum + moneyNumber(row.amount), 0);

    const chart = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      const income = transactionRows.filter((row) => row.type === "income" && isSameDay(new Date(row.occurredAt), date)).reduce((sum, row) => sum + moneyNumber(row.amount), 0);
      const expense = transactionRows.filter((row) => row.type === "expense" && isSameDay(new Date(row.occurredAt), date)).reduce((sum, row) => sum + moneyNumber(row.amount), 0);
      return { day: date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""), income, expense, balance: income - expense };
    });

    const physical = accountRows.filter((row) => row.status === "active" && row.type === "physical").reduce((sum, row) => sum + moneyNumber(row.balance), 0);
    const digital = accountRows.filter((row) => row.status === "active" && row.type === "digital").reduce((sum, row) => sum + moneyNumber(row.balance), 0);
    const investments = accountRows.filter((row) => row.status === "active" && row.type === "investment").reduce((sum, row) => sum + moneyNumber(row.balance), 0);
    const upcomingBills = billRows.filter((row) => row.status !== "paid").slice(0, 5);
    const upcomingDebts = debtsWithTotals.filter((row) => row.remainingAmount > 0 && row.nextDueDate).slice(0, 4);
    const alerts = [
      ...billRows.filter((row) => row.status === "overdue").map((row) => ({ type: "danger", label: `${row.name} está atrasada`, date: row.dueDate })),
      ...receivablesWithTotals.filter((row) => row.computedStatus === "overdue").map((row) => ({ type: "warning", label: `${row.person} tem um recebimento atrasado`, date: row.dueDate })),
      ...debtsWithTotals.filter((row) => row.computedStatus === "overdue").map((row) => ({ type: "danger", label: `${row.name} está atrasada`, date: row.nextDueDate })),
    ].slice(0, 4);

    return Response.json({
      profile,
      settings: settingRows[0] ?? null,
      accounts: accountRows,
      categories: categoryRows,
      transactions: transactionRows,
      receivables: receivablesWithTotals,
      debts: debtsWithTotals,
      bills: billRows,
      goals: goalRows.map((row) => ({ ...row, remainingAmount: Math.max(0, moneyNumber(row.targetAmount) - moneyNumber(row.currentAmount)), progress: Math.min(100, Math.round((moneyNumber(row.currentAmount) / Math.max(1, moneyNumber(row.targetAmount))) * 100)) })),
      settlement: settlementRows[0] ? { ...settlementRows[0], remainingAmount: Math.max(0, moneyNumber(settlementRows[0].targetAmount) - moneyNumber(settlementRows[0].savedAmount)), progress: Math.min(100, Math.round((moneyNumber(settlementRows[0].savedAmount) / Math.max(1, moneyNumber(settlementRows[0].targetAmount))) * 100)) } : null,
      totals: { available, toReceive, debtTotal, netWorth: available + toReceive - debtTotal, physical, digital, investments },
      today: { income: todayIncome, expense: todayExpense, result: todayIncome - todayExpense, total: transactionRows.filter((row) => isSameDay(new Date(row.occurredAt), today)).length, incomeCount: transactionRows.filter((row) => row.type === "income" && isSameDay(new Date(row.occurredAt), today)).length, expenseCount: transactionRows.filter((row) => row.type === "expense" && isSameDay(new Date(row.occurredAt), today)).length },
      month: { income: monthIncome, expense: monthExpense, result: monthIncome - monthExpense },
      chart,
      upcomingBills,
      upcomingDebts,
      alerts,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return jsonError(error, 500);
  }
}
