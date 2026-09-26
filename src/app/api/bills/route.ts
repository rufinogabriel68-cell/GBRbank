import { db } from "@/db";
import { billStatuses } from "@/db/schema";
import { byProfile, dayKey, ensureProfile, jsonError, logAction, parseDateOnly, positiveAmount } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await ensureProfile();
    const rows = await db.list("bills", { where: byProfile(profile.id), orderBy: [{ field: "dueDate", direction: "asc" }] });
    const today = dayKey(new Date());
    return Response.json(
      rows.map((row) => ({
        ...row,
        computedStatus: row.status !== "paid" && today && row.dueDate && row.dueDate < today ? "overdue" : row.status,
      })),
    );
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await ensureProfile();
    const body = await request.json();
    if (!String(body.name ?? "").trim() || !body.dueDate) throw new Error("Informe nome e vencimento.");
    const row = await db.create("bills", {
      profileId: profile.id,
      name: String(body.name).trim(),
      amount: positiveAmount(body.amount),
      dueDate: parseDateOnly(body.dueDate)!,
      recurrence: String(body.recurrence || "none"),
      category: String(body.category || "Outros"),
      status: (billStatuses as readonly string[]).includes(body.status) ? body.status : "pending",
    });
    await logAction(profile.id, "created", "bill", row.id);
    return Response.json(row, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
