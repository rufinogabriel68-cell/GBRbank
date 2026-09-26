import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { goals } from "@/db/schema";
import { ensureProfile, jsonError, logAction, parseDateOnly, positiveAmount } from "@/lib/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const profile = await ensureProfile(); const body = await request.json();
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) values.name = String(body.name).trim();
    if (body.targetAmount !== undefined) values.targetAmount = positiveAmount(body.targetAmount);
    if (body.currentAmount !== undefined) values.currentAmount = body.currentAmount ? positiveAmount(body.currentAmount) : "0";
    if (body.deadline !== undefined) values.deadline = parseDateOnly(body.deadline);
    if (body.category !== undefined) values.category = String(body.category);
    if (body.note !== undefined) values.note = body.note ? String(body.note) : null;
    const [row] = await db.update(goals).set(values).where(and(eq(goals.id, id), eq(goals.profileId, profile.id))).returning();
    if (!row) throw new Error("Meta não encontrada.");
    await logAction(profile.id, "updated", "goal", id); return Response.json(row);
  } catch (error) { return jsonError(error); }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const profile = await ensureProfile();
    const [row] = await db.delete(goals).where(and(eq(goals.id, id), eq(goals.profileId, profile.id))).returning();
    if (!row) throw new Error("Meta não encontrada.");
    await logAction(profile.id, "deleted", "goal", id); return Response.json({ ok: true });
  } catch (error) { return jsonError(error); }
}
