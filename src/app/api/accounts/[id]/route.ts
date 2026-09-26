import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { ensureProfile, jsonError, logAction, nonNegativeAmount } from "@/lib/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profile = await ensureProfile();
    const body = await request.json();
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) values.name = String(body.name).trim();
    if (body.description !== undefined) values.description = body.description ? String(body.description).trim() : null;
    if (body.type && ["physical", "digital", "investment", "other"].includes(body.type)) values.type = body.type;
    if (body.balance !== undefined) values.balance = nonNegativeAmount(body.balance);
    if (body.status && ["active", "archived"].includes(body.status)) values.status = body.status;
    const [account] = await db.update(accounts).set(values).where(eq(accounts.id, id)).returning();
    if (!account || account.profileId !== profile.id) throw new Error("Conta não encontrada.");
    await logAction(profile.id, "updated", "account", id);
    return Response.json(account);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profile = await ensureProfile();
    const [account] = await db.update(accounts).set({ status: "archived", updatedAt: new Date() }).where(eq(accounts.id, id)).returning();
    if (!account || account.profileId !== profile.id) throw new Error("Conta não encontrada.");
    await logAction(profile.id, "archived", "account", id);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
