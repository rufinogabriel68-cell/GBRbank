import { db } from "@/db";
import { accountTypes } from "@/db/schema";
import { byProfile, ensureProfile, jsonError, logAction, nonNegativeAmount } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await ensureProfile();
    return Response.json(await db.list("accounts", { where: byProfile(profile.id), orderBy: [{ field: "createdAt", direction: "desc" }] }));
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const profile = await ensureProfile();
    if (!String(body.name ?? "").trim()) throw new Error("Informe o nome da conta.");
    const account = await db.create("accounts", {
      profileId: profile.id,
      name: String(body.name).trim(),
      type: (accountTypes as readonly string[]).includes(body.type) ? body.type : "digital",
      balance: body.balance !== undefined && body.balance !== "" ? nonNegativeAmount(body.balance) : "0.00",
      description: body.description ? String(body.description).trim() : null,
      status: "active",
    });
    await logAction(profile.id, "created", "account", account.id, { name: account.name });
    return Response.json(account, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
