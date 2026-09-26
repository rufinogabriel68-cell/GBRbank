import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { ensureProfile, jsonError, logAction, nonNegativeAmount } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await ensureProfile();
    return Response.json(await db.select().from(accounts).where(eq(accounts.profileId, profile.id)).orderBy(desc(accounts.createdAt)));
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const profile = await ensureProfile();
    if (!String(body.name ?? "").trim()) throw new Error("Informe o nome da conta.");
    const [account] = await db.insert(accounts).values({
      profileId: profile.id,
      name: String(body.name).trim(),
      type: ["physical", "digital", "investment", "other"].includes(body.type) ? body.type : "digital",
      balance: body.balance !== undefined && body.balance !== "" ? nonNegativeAmount(body.balance) : "0",
      description: body.description ? String(body.description).trim() : undefined,
    }).returning();
    await logAction(profile.id, "created", "account", account.id, { name: account.name });
    return Response.json(account, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
