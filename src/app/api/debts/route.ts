import { db } from "@/db";
import { byProfile, ensureProfile, fromCents, jsonError, logAction, parseDateOnly, positiveAmount, safeCents } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await ensureProfile();
    const [rows, payments] = await Promise.all([
      db.list("debts", { where: byProfile(profile.id), orderBy: [{ field: "nextDueDate", direction: "desc" }] }),
      db.list("debt_payments", { where: byProfile(profile.id) }),
    ]);
    return Response.json(
      rows.map((row) => {
        const paid = payments.filter((payment) => payment.debtId === row.id).reduce((total, payment) => total + safeCents(payment.amount), 0);
        const remaining = Math.max(0, safeCents(row.originalAmount) - paid);
        return { ...row, paidAmount: Number(fromCents(paid)), remainingAmount: Number(fromCents(remaining)) };
      }),
    );
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await ensureProfile();
    const body = await request.json();
    if (!String(body.name ?? "").trim() || !String(body.creditor ?? "").trim()) throw new Error("Informe nome e credor.");
    const row = await db.create("debts", {
      profileId: profile.id,
      name: String(body.name).trim(),
      creditor: String(body.creditor).trim(),
      category: String(body.category || "Outros"),
      originalAmount: positiveAmount(body.originalAmount ?? body.amount),
      installments: body.installments ? Number(body.installments) : null,
      installmentAmount: body.installmentAmount ? positiveAmount(body.installmentAmount) : null,
      nextDueDate: parseDateOnly(body.nextDueDate) ?? null,
      status: "pending",
      note: body.note ? String(body.note) : null,
    });
    await logAction(profile.id, "created", "debt", row.id);
    return Response.json(row, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
