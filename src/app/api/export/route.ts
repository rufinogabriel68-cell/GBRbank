import { db } from "@/db";
import { byProfile, ensureProfile, jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";

function csvValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Backup completo (JSON) ou movimentações em planilha (CSV). */
export async function GET(request: Request) {
  try {
    const profile = await ensureProfile();
    const format = new URL(request.url).searchParams.get("format") ?? "json";
    const where = byProfile(profile.id);

    const [transactionRows, accountRows, receivableRows, debtRows, goalRows, billRows, categoryRows] = await Promise.all([
      db.list("transactions", { where, orderBy: [{ field: "occurredAt", direction: "desc" }] }),
      db.list("accounts", { where }),
      db.list("receivables", { where }),
      db.list("debts", { where }),
      db.list("goals", { where }),
      db.list("bills", { where }),
      db.list("categories", { where }),
    ]);

    if (format === "csv") {
      const accountName = new Map(accountRows.map((row) => [row.id, row.name]));
      const header = "data;tipo;valor;descricao;conta;origem";
      const lines = transactionRows.map((row) =>
        [row.occurredAt, row.type, row.amount, row.description ?? "", accountName.get(row.accountId) ?? "", row.origin]
          .map((value) => `"${csvValue(value).replaceAll('"', '""')}"`)
          .join(";"),
      );
      const csv = [header, ...lines].join("\n");
      return new Response(`\uFEFF${csv}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=gbr-bank-movimentacoes.csv",
        },
      });
    }

    return Response.json(
      {
        exportedAt: new Date().toISOString(),
        format: "gbr-bank/1",
        database: db.info(),
        profile: { id: profile.id, name: profile.name, email: profile.email, username: profile.username },
        accounts: accountRows,
        categories: categoryRows,
        transactions: transactionRows,
        receivables: receivableRows,
        debts: debtRows,
        goals: goalRows,
        bills: billRows,
      },
      { headers: { "Content-Disposition": "attachment; filename=gbr-bank-backup.json" } },
    );
  } catch (error) {
    return jsonError(error, 500);
  }
}
