import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bills } from "@/db/schema";
import { ensureProfile, jsonError, logAction, parseDateOnly, positiveAmount } from "@/lib/server";

export async function GET() {
  try {
    const profile = await ensureProfile();
    const rows = await db.select().from(bills).where(eq(bills.profileId, profile.id)).orderBy(asc(bills.dueDate));
    const today = new Date().toISOString().slice(0, 10);
    return Response.json(rows.map((row) => ({ ...row, computedStatus: row.status !== "paid" && row.dueDate < today ? "overdue" : row.status })));
  } catch (error) { return jsonError(error, 500); }
}

export async function POST(request: Request) {
  try {
    const profile = await ensureProfile();
    const body = await request.json();
    if (!String(body.name ?? "").trim() || !body.dueDate) throw new Error("Informe nome e vencimento.");
    const [row] = await db.insert(bills).values({ profileId: profile.id, name: String(body.name).trim(), amount: positiveAmount(body.amount), dueDate: parseDateOnly(body.dueDate)!, recurrence: String(body.recurrence || "none"), category: String(body.category || "Outros") }).returning();
    await logAction(profile.id, "created", "bill", row.id);
    return Response.json(row, { status: 201 });
  } catch (error) { return jsonError(error); }
}
