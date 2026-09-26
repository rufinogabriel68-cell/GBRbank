import { db } from "@/db";
import type { Row } from "@/db/types";
import {
  dayKey,
  ensureProfile,
  fromCents,
  isSameDay,
  isSameMonth,
  jsonError,
  safeCents,
} from "@/lib/server";

export const dynamic = "force-dynamic";

const TRANSACTION_LIMIT = 500;

export async function GET() {
  try {
    const profile = await ensureProfile();
    const profileId = profile.id;
    const where = { profileId };

    const [accountRows, categoryRows, transactionRows, receivableRows, receivablePaymentRows, debtRows, debtPaymentRows, billRows, goalRows, settlementRow, settingsRow] = await Promise.all([
      db.list("accounts", { where, orderBy: [{ field: "createdAt", direction: "desc" }] }),
      db.list("categories", { where }),
      db.list("transactions", { where, orderBy: [{ field: "occurredAt", direction: "desc" }], limit: TRANSACTION_LIMIT }),
      db.list("receivables", { where, orderBy: [{ field: "dueDate", direction: "desc" }] }),
      db.list("receivable_payments", { where }),
      db.list("debts", { where, orderBy: [{ field: "nextDueDate", direction: "desc" }] }),
      db.list("debt_payments", { where }),
      db.list("bills", { where, orderBy: [{ field: "dueDate", direction: "asc" }] }),
      db.list("goals", { where, orderBy: [{ field: "createdAt", direction: "desc" }] }),
      db.findOne("personal_settlement", where),
      db.findOne("settings", where),
    ]);

    const today = new Date();
    const todayKey = dayKey(today);

    const receivedById = new Map<string, number>();
    for (const row of receivablePaymentRows) receivedById.set(row.receivableId, (receivedById.get(row.receivableId) ?? 0) + safeCents(row.amount));
    const paidById = new Map<string, number>();
    for (const row of debtPaymentRows) paidById.set(row.debtId, (paidById.get(row.debtId) ?? 0) + safeCents(row.amount));

    const receivablesWithTotals: Row[] = receivableRows.map((row): Row => {
      const received = receivedById.get(row.id) ?? 0;
      const original = safeCents(row.originalAmount);
      const remaining = Math.max(0, original - received);
      const overdue = Boolean(row.dueDate && todayKey && row.dueDate < todayKey && remaining > 0);
      return {
        ...row,
        receivedAmount: Number(fromCents(received)),
        remainingAmount: Number(fromCents(remaining)),
        computedStatus: overdue ? "overdue" : remaining <= 0 ? "received" : received > 0 ? "partial" : row.status,
      };
    });

    const debtsWithTotals: Row[] = debtRows.map((row): Row => {
      const paid = paidById.get(row.id) ?? 0;
      const original = safeCents(row.originalAmount);
      const remaining = Math.max(0, original - paid);
      const overdue = Boolean(row.nextDueDate && todayKey && row.nextDueDate < todayKey && remaining > 0);
      return {
        ...row,
        paidAmount: Number(fromCents(paid)),
        remainingAmount: Number(fromCents(remaining)),
        computedStatus: overdue ? "overdue" : remaining <= 0 ? "paid" : paid > 0 ? "partial" : row.status,
      };
    });

    const activeAccounts = accountRows.filter((row: Row) => row.status === "active");
    const centsOf = (rows: Row[], filter?: (row: Row) => boolean) =>
      rows.filter((row) => (filter ? filter(row) : true)).reduce((total, row) => total + safeCents(row.balance), 0);

    const available = centsOf(activeAccounts);
    const toReceive = receivablesWithTotals.reduce((total, row) => total + Math.round(row.remainingAmount * 100), 0);
    const debtTotal = debtsWithTotals.reduce((total, row) => total + Math.round(row.remainingAmount * 100), 0);

    const sumBy = (rows: Row[], type: string, test: (row: Row) => boolean) =>
      rows.filter((row) => row.type === type && test(row)).reduce((total, row) => total + safeCents(row.amount), 0);

    const todayIncome = sumBy(transactionRows, "income", (row) => isSameDay(row.occurredAt, today));
    const todayExpense = sumBy(transactionRows, "expense", (row) => isSameDay(row.occurredAt, today));
    const monthIncome = sumBy(transactionRows, "income", (row) => isSameMonth(row.occurredAt, today));
    const monthExpense = sumBy(transactionRows, "expense", (row) => isSameMonth(row.occurredAt, today));
    const todayTotal = transactionRows.filter((row) => isSameDay(row.occurredAt, today)).length;
    const todayIncomeCount = transactionRows.filter((row) => row.type === "income" && isSameDay(row.occurredAt, today)).length;
    const todayExpenseCount = transactionRows.filter((row) => row.type === "expense" && isSameDay(row.occurredAt, today)).length;

    const chart = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      const income = sumBy(transactionRows, "income", (row) => isSameDay(row.occurredAt, date));
      const expense = sumBy(transactionRows, "expense", (row) => isSameDay(row.occurredAt, date));
      return {
        day: date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
        income: Number(fromCents(income)),
        expense: Number(fromCents(expense)),
        balance: Number(fromCents(income - expense)),
      };
    });

    const byType = (type: string) => centsOf(activeAccounts, (row) => row.type === type);

    const upcomingBills = billRows.filter((row: Row) => row.status !== "paid").slice(0, 5);
    const upcomingDebts = debtsWithTotals.filter((row) => row.remainingAmount > 0 && row.nextDueDate).slice(0, 4);

    const alerts = [
      ...billRows
        .filter((row: Row) => row.status === "overdue" || (row.status !== "paid" && todayKey && row.dueDate && row.dueDate < todayKey))
        .map((row: Row) => ({ type: "danger", label: `${row.name} está atrasada`, date: row.dueDate })),
      ...receivablesWithTotals.filter((row) => row.computedStatus === "overdue").map((row) => ({ type: "warning", label: `${row.person} tem um recebimento atrasado`, date: row.dueDate })),
      ...debtsWithTotals.filter((row) => row.computedStatus === "overdue").map((row) => ({ type: "danger", label: `${row.name} está atrasada`, date: row.nextDueDate })),
    ].slice(0, 4);

    const goalRowsWithProgress: Row[] = goalRows.map((row: Row): Row => {
      const target = safeCents(row.targetAmount);
      const current = safeCents(row.currentAmount);
      return {
        ...row,
        remainingAmount: Number(fromCents(Math.max(0, target - current))),
        progress: Math.min(100, Math.round((current / Math.max(1, target)) * 100)),
      };
    });

    let settlement = null;
    if (settlementRow) {
      const target = safeCents(settlementRow.targetAmount);
      const saved = safeCents(settlementRow.savedAmount);
      settlement = {
        ...settlementRow,
        remainingAmount: Number(fromCents(Math.max(0, target - saved))),
        progress: Math.min(100, Math.round((saved / Math.max(1, target)) * 100)),
      };
    }

    return Response.json({
      profile,
      settings: settingsRow ?? null,
      database: db.info(),
      accounts: accountRows,
      categories: categoryRows,
      transactions: transactionRows,
      receivables: receivablesWithTotals,
      debts: debtsWithTotals,
      bills: billRows,
      goals: goalRowsWithProgress,
      settlement,
      totals: {
        available: Number(fromCents(available)),
        toReceive: Number(fromCents(toReceive)),
        debtTotal: Number(fromCents(debtTotal)),
        netWorth: Number(fromCents(available + toReceive - debtTotal)),
        physical: Number(fromCents(byType("physical"))),
        digital: Number(fromCents(byType("digital"))),
        investments: Number(fromCents(byType("investment"))),
      },
      today: {
        income: Number(fromCents(todayIncome)),
        expense: Number(fromCents(todayExpense)),
        result: Number(fromCents(todayIncome - todayExpense)),
        total: todayTotal,
        incomeCount: todayIncomeCount,
        expenseCount: todayExpenseCount,
      },
      month: {
        income: Number(fromCents(monthIncome)),
        expense: Number(fromCents(monthExpense)),
        result: Number(fromCents(monthIncome - monthExpense)),
      },
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
