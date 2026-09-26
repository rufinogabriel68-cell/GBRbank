import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bills } from "@/db/schema";
import { ensureProfile, jsonError, logAction, parseDateOnly, positiveAmount } from "@/lib/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const profile = await ensureProfile(); const body = await request.json();
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) values.name = String(body.name).trim();
    if (body.amount !== undefined) values.amount = positiveAmount(body.amount);
    if (body.dueDate !== undefined) values.dueDate = parseDateOnly(body.dueDate);
    if (body.status && ["pending", "paid", "overdue"].includes(body.status)) values.status = body.status;
    if (body.recurrence !== undefined) values.recurrence = String(body.recurrence);
    const [row] = await db.update(bills).set(values).where(and(eq(bills.id, id), eq(bills.profileId, profile.id))).returning();
    if (!row) throw new Error("Conta não encontrada.");
    await logAction(profile.id, "updated", "bill", id); return Response.json(row);
  } catch (error) { return jsonError(error); }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const profile = await ensureProfile();
    const [row] = await db.delete(bills).where(and(eq(bills.id, id), eq(bills.profileId, profile.id))).returning();
    if (!row) throw new Error("Conta não encontrada.");
    await logAction(profile.id, "deleted", "bill", id); return Response.json({ ok: true });
  } catch (error) { return jsonError(error); }
}
