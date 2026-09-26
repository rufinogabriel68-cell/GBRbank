import { db } from "@/db";
import { byProfile, ensureProfile, fromCents, jsonError, logAction, parseDateOnly, positiveAmount, safeCents } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await ensureProfile();
    const rows = await db.list("goals", { where: byProfile(profile.id), orderBy: [{ field: "createdAt", direction: "desc" }] });
    return Response.json(
      rows.map((row) => {
        const target = safeCents(row.targetAmount);
        const current = safeCents(row.currentAmount);
        return {
          ...row,
          remainingAmount: Number(fromCents(Math.max(0, target - current))),
          progress: Math.min(100, Math.round((current / Math.max(1, target)) * 100)),
        };
      }),
    );
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await ensureProfile();
    const body = await request.json();
    if (!String(body.name ?? "").trim()) throw new Error("Informe o nome da meta.");
    const row = await db.create("goals", {
      profileId: profile.id,
      name: String(body.name).trim(),
      targetAmount: positiveAmount(body.targetAmount),
      currentAmount: body.currentAmount && safeCents(body.currentAmount) > 0 ? positiveAmount(body.currentAmount) : "0.00",
      deadline: parseDateOnly(body.deadline) ?? null,
      category: String(body.category || "Outros"),
      note: body.note ? String(body.note) : null,
    });
    await logAction(profile.id, "created", "goal", row.id);
    return Response.json(row, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
