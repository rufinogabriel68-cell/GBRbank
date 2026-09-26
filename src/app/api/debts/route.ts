import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { debtPayments, debts } from "@/db/schema";
import { ensureProfile, jsonError, logAction, parseDateOnly, positiveAmount } from "@/lib/server";

export async function GET() {
  try {
    const profile = await ensureProfile();
    const rows = await db.select().from(debts).where(eq(debts.profileId, profile.id)).orderBy(desc(debts.nextDueDate));
    const payments = await db.select().from(debtPayments).where(eq(debtPayments.profileId, profile.id));
    return Response.json(rows.map((row) => {
      const paidAmount = payments.filter((payment) => payment.debtId === row.id).reduce((sum, payment) => sum + Number(payment.amount), 0);
      return { ...row, paidAmount, remainingAmount: Math.max(0, Number(row.originalAmount) - paidAmount) };
    }));
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await ensureProfile();
    const body = await request.json();
    if (!String(body.name ?? "").trim() || !String(body.creditor ?? "").trim()) throw new Error("Informe nome e credor.");
    const [row] = await db.insert(debts).values({ profileId: profile.id, name: String(body.name).trim(), creditor: String(body.creditor).trim(), category: String(body.category || "Outros"), originalAmount: positiveAmount(body.originalAmount), installments: body.installments ? Number(body.installments) : undefined, installmentAmount: body.installmentAmount ? positiveAmount(body.installmentAmount) : undefined, nextDueDate: parseDateOnly(body.nextDueDate), note: body.note ? String(body.note) : undefined }).returning();
    await logAction(profile.id, "created", "debt", row.id);
    return Response.json(row, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
