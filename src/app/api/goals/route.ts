import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { goals } from "@/db/schema";
import { ensureProfile, jsonError, logAction, parseDateOnly, positiveAmount } from "@/lib/server";

export async function GET() {
  try {
    const profile = await ensureProfile();
    const rows = await db.select().from(goals).where(eq(goals.profileId, profile.id)).orderBy(desc(goals.createdAt));
    return Response.json(rows.map((row) => ({ ...row, remainingAmount: Math.max(0, Number(row.targetAmount) - Number(row.currentAmount)), progress: Math.min(100, Math.round((Number(row.currentAmount) / Math.max(1, Number(row.targetAmount))) * 100)) })));
  } catch (error) { return jsonError(error, 500); }
}

export async function POST(request: Request) {
  try {
    const profile = await ensureProfile(); const body = await request.json();
    if (!String(body.name ?? "").trim()) throw new Error("Informe o nome da meta.");
    const [row] = await db.insert(goals).values({ profileId: profile.id, name: String(body.name).trim(), targetAmount: positiveAmount(body.targetAmount), currentAmount: body.currentAmount && Number(String(body.currentAmount).replace(",", ".")) > 0 ? positiveAmount(body.currentAmount) : "0", deadline: parseDateOnly(body.deadline), category: String(body.category || "Outros"), note: body.note ? String(body.note) : undefined }).returning();
    await logAction(profile.id, "created", "goal", row.id); return Response.json(row, { status: 201 });
  } catch (error) { return jsonError(error); }
}
