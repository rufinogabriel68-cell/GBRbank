import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { receivables } from "@/db/schema";
import { ensureProfile, jsonError, logAction, parseDateOnly, positiveAmount } from "@/lib/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profile = await ensureProfile();
    const body = await request.json();
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.person !== undefined) values.person = String(body.person).trim();
    if (body.description !== undefined) values.description = String(body.description).trim();
    if (body.originalAmount !== undefined) values.originalAmount = positiveAmount(body.originalAmount);
    if (body.dueDate !== undefined) values.dueDate = parseDateOnly(body.dueDate);
    if (body.note !== undefined) values.note = body.note ? String(body.note) : null;
    const [row] = await db.update(receivables).set(values).where(and(eq(receivables.id, id), eq(receivables.profileId, profile.id))).returning();
    if (!row) throw new Error("Valor a receber não encontrado.");
    await logAction(profile.id, "updated", "receivable", id);
    return Response.json(row);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profile = await ensureProfile();
    const [row] = await db.delete(receivables).where(and(eq(receivables.id, id), eq(receivables.profileId, profile.id))).returning();
    if (!row) throw new Error("Valor a receber não encontrado.");
    await logAction(profile.id, "deleted", "receivable", id);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
