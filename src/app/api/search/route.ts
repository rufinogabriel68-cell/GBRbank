import { db } from "@/db";
import { byProfile, ensureProfile, jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";

const LIMIT = 15;

function contains(row: Record<string, unknown>, fields: string[], query: string) {
  return fields.some((field) => String(row[field] ?? "").toLowerCase().includes(query));
}

export async function GET(request: Request) {
  try {
    const profile = await ensureProfile();
    const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase();
    if (!query) return Response.json({ transactions: [], receivables: [], debts: [], goals: [] });

    const where = byProfile(profile.id);
    const [transactionRows, receivableRows, debtRows, goalRows] = await Promise.all([
      db.list("transactions", { where, orderBy: [{ field: "occurredAt", direction: "desc" }] }),
      db.list("receivables", { where }),
      db.list("debts", { where }),
      db.list("goals", { where }),
    ]);

    return Response.json({
      transactions: transactionRows.filter((row) => contains(row, ["description", "note"], query)).slice(0, LIMIT),
      receivables: receivableRows.filter((row) => contains(row, ["person", "description", "note"], query)).slice(0, LIMIT),
      debts: debtRows.filter((row) => contains(row, ["name", "creditor", "note"], query)).slice(0, LIMIT),
      goals: goalRows.filter((row) => contains(row, ["name", "note"], query)).slice(0, LIMIT),
    });
  } catch (error) {
    return jsonError(error, 500);
  }
}
