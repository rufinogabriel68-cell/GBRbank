import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { receivablePayments, receivables } from "@/db/schema";
import { ensureProfile, jsonError, logAction, parseDateOnly, positiveAmount } from "@/lib/server";

export async function GET() {
  try {
    const profile = await ensureProfile();
    const rows = await db.select().from(receivables).where(eq(receivables.profileId, profile.id)).orderBy(desc(receivables.dueDate));
    const payments = await db.select().from(receivablePayments).where(eq(receivablePayments.profileId, profile.id));
    return Response.json(rows.map((row) => {
      const receivedAmount = payments.filter((payment) => payment.receivableId === row.id).reduce((sum, payment) => sum + Number(payment.amount), 0);
      return { ...row, receivedAmount, remainingAmount: Math.max(0, Number(row.originalAmount) - receivedAmount) };
    }));
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await ensureProfile();
    const body = await request.json();
    if (!String(body.person ?? "").trim() || !String(body.description ?? "").trim()) throw new Error("Informe pessoa e descrição.");
    const [row] = await db.insert(receivables).values({ profileId: profile.id, person: String(body.person).trim(), description: String(body.description).trim(), originalAmount: positiveAmount(body.originalAmount), dueDate: parseDateOnly(body.dueDate), note: body.note ? String(body.note) : undefined }).returning();
    await logAction(profile.id, "created", "receivable", row.id);
    return Response.json(row, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
