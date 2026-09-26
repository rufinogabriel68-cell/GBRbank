import { db } from "@/db";
import { accountStatuses, accountTypes } from "@/db/schema";
import { ensureProfile, findOwned, jsonError, logAction, nonNegativeAmount } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profile = await ensureProfile();
    const body = await request.json();
    const current = await findOwned("accounts", id, profile.id);
    if (!current) throw new Error("Conta não encontrada.");

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) values.name = String(body.name).trim();
    if (body.description !== undefined) values.description = body.description ? String(body.description).trim() : null;
    if (body.type && (accountTypes as readonly string[]).includes(body.type)) values.type = body.type;
    if (body.balance !== undefined) values.balance = nonNegativeAmount(body.balance);
    if (body.status && (accountStatuses as readonly string[]).includes(body.status)) values.status = body.status;

    const account = await db.update("accounts", id, values);
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
    const current = await findOwned("accounts", id, profile.id);
    if (!current) throw new Error("Conta não encontrada.");
    await db.update("accounts", id, { status: "archived", updatedAt: new Date() });
    await logAction(profile.id, "archived", "account", id);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
