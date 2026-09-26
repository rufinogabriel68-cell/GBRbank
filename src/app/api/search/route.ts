import { ilike, or, eq } from "drizzle-orm";
import { db } from "@/db";
import { debts, goals, receivables, transactions } from "@/db/schema";
import { ensureProfile, jsonError } from "@/lib/server";

export async function GET(request: Request) {
  try {
    const profile = await ensureProfile(); const query = new URL(request.url).searchParams.get("q")?.trim();
    if (!query) return Response.json([]);
    const pattern = `%${query}%`;
    const [transactionRows, receivableRows, debtRows, goalRows] = await Promise.all([
      db.select().from(transactions).where(or(eq(transactions.profileId, profile.id), ilike(transactions.description, pattern))).limit(15),
      db.select().from(receivables).where(or(eq(receivables.profileId, profile.id), ilike(receivables.person, pattern), ilike(receivables.description, pattern))).limit(15),
      db.select().from(debts).where(or(eq(debts.profileId, profile.id), ilike(debts.name, pattern), ilike(debts.creditor, pattern))).limit(15),
      db.select().from(goals).where(or(eq(goals.profileId, profile.id), ilike(goals.name, pattern))).limit(15),
    ]);
    return Response.json({ transactions: transactionRows.filter((row) => `${row.description ?? ""}`.toLowerCase().includes(query.toLowerCase())), receivables: receivableRows.filter((row) => `${row.person} ${row.description}`.toLowerCase().includes(query.toLowerCase())), debts: debtRows.filter((row) => `${row.name} ${row.creditor}`.toLowerCase().includes(query.toLowerCase())), goals: goalRows.filter((row) => row.name.toLowerCase().includes(query.toLowerCase())) });
  } catch (error) { return jsonError(error, 500); }
}
