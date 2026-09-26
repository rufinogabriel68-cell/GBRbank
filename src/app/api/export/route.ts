import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, debts, goals, receivables, transactions } from "@/db/schema";
import { ensureProfile, jsonError } from "@/lib/server";

export async function GET(request: Request) {
  try {
    const profile = await ensureProfile();
    const format = new URL(request.url).searchParams.get("format") ?? "json";
    const [transactionsRows, accountsRows, receivablesRows, debtsRows, goalsRows] = await Promise.all([
      db.select().from(transactions).where(eq(transactions.profileId, profile.id)),
      db.select().from(accounts).where(eq(accounts.profileId, profile.id)),
      db.select().from(receivables).where(eq(receivables.profileId, profile.id)),
      db.select().from(debts).where(eq(debts.profileId, profile.id)),
      db.select().from(goals).where(eq(goals.profileId, profile.id)),
    ]);
    const data = { exportedAt: new Date().toISOString(), profile: { name: profile.name, email: profile.email }, transactions: transactionsRows, accounts: accountsRows, receivables: receivablesRows, debts: debtsRows, goals: goalsRows };
    if (format === "csv") {
      const rows = transactionsRows.map((row) => [row.occurredAt.toISOString(), row.type, row.amount, row.description ?? "", row.origin]);
      const csv = ["data,tipo,valor,descricao,origem", ...rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";"))].join("\n");
      return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=gbr-bank-movimentacoes.csv" } });
    }
    return Response.json(data, { headers: { "Content-Disposition": "attachment; filename=gbr-bank-backup.json" } });
  } catch (error) {
    return jsonError(error, 500);
  }
}
