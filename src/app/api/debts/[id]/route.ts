import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { debts } from "@/db/schema";
import { ensureProfile, jsonError, logAction, parseDateOnly, positiveAmount } from "@/lib/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profile = await ensureProfile();
    const body = await request.json();
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) values.name = String(body.name).trim();
    if (body.creditor !== undefined) values.creditor = String(body.creditor).trim();
    if (body.category !== undefined) values.category = String(body.category);
    if (body.originalAmount !== undefined) values.originalAmount = positiveAmount(body.originalAmount);
    if (body.nextDueDate !== undefined) values.nextDueDate = parseDateOnly(body.nextDueDate);
    if (body.note !== undefined) values.note = body.note ? String(body.note) : null;
    const [row] = await db.update(debts).set(values).where(and(eq(debts.id, id), eq(debts.profileId, profile.id))).returning();
    if (!row) throw new Error("Dívida não encontrada.");
    await logAction(profile.id, "updated", "debt", id);
    return Response.json(row);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profile = await ensureProfile();
    const [row] = await db.delete(debts).where(and(eq(debts.id, id), eq(debts.profileId, profile.id))).returning();
    if (!row) throw new Error("Dívida não encontrada.");
    await logAction(profile.id, "deleted", "debt", id);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
