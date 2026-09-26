import { db } from "@/db";
import { byProfile, ensureProfile, fromCents, jsonError, logAction, parseDateOnly, positiveAmount, safeCents } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await ensureProfile();
    const [rows, payments] = await Promise.all([
      db.list("receivables", { where: byProfile(profile.id), orderBy: [{ field: "dueDate", direction: "desc" }] }),
      db.list("receivable_payments", { where: byProfile(profile.id) }),
    ]);
    return Response.json(
      rows.map((row) => {
        const received = payments.filter((payment) => payment.receivableId === row.id).reduce((total, payment) => total + safeCents(payment.amount), 0);
        const remaining = Math.max(0, safeCents(row.originalAmount) - received);
        return { ...row, receivedAmount: Number(fromCents(received)), remainingAmount: Number(fromCents(remaining)) };
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
    if (!String(body.person ?? "").trim() || !String(body.description ?? "").trim()) throw new Error("Informe pessoa e descrição.");
    const row = await db.create("receivables", {
      profileId: profile.id,
      person: String(body.person).trim(),
      description: String(body.description).trim(),
      originalAmount: positiveAmount(body.originalAmount ?? body.amount),
      dueDate: parseDateOnly(body.dueDate) ?? null,
      status: "pending",
      note: body.note ? String(body.note) : null,
    });
    await logAction(profile.id, "created", "receivable", row.id);
    return Response.json(row, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
