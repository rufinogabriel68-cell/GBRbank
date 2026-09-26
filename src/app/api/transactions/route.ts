import { db } from "@/db";
import { transactionTypes } from "@/db/schema";
import {
  byProfile,
  ensureProfile,
  getCategory,
  jsonError,
  logAction,
  moneyAdd,
  moneyGreaterOrEqual,
  moneySub,
  optionalDate,
  positiveAmount,
} from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const profile = await ensureProfile();
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.toLowerCase();

    const [rows, accountRows, categoryRows] = await Promise.all([
      db.list("transactions", { where: byProfile(profile.id), orderBy: [{ field: "occurredAt", direction: "desc" }], limit: 500 }),
      db.list("accounts", { where: byProfile(profile.id) }),
      db.list("categories", { where: byProfile(profile.id) }),
    ]);

    const accountName = new Map(accountRows.map((row) => [row.id, row.name]));
    const categoryName = new Map(categoryRows.map((row) => [row.id, row.name]));
    const enriched = rows.map((row) => ({
      transaction: row,
      accountName: accountName.get(row.accountId) ?? null,
      categoryName: row.categoryId ? (categoryName.get(row.categoryId) ?? null) : null,
    }));

    return Response.json(
      search
        ? enriched.filter((row) => `${row.transaction.description ?? ""} ${row.accountName ?? ""} ${row.categoryName ?? ""}`.toLowerCase().includes(search))
        : enriched,
    );
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const profile = await ensureProfile();
    const type = body.type;
    if (!(transactionTypes as readonly string[]).includes(type)) throw new Error("Tipo de movimentação inválido.");

    const amount = positiveAmount(body.amount);
    const description = String(body.description ?? "").trim() || (type === "income" ? "Entrada" : type === "expense" ? "Saída" : "Transferência");
    const occurredAt = optionalDate(body.occurredAt) ?? new Date();
    const origin = body.origin === "gbr" ? "gbr" : "personal";

    if (type === "transfer") {
      if (!body.fromAccountId || !body.toAccountId || body.fromAccountId === body.toAccountId) throw new Error("Escolha contas de origem e destino diferentes.");

      const result = await db.withTransaction(async (tx) => {
        const source = await tx.findOne("accounts", { id: body.fromAccountId, profileId: profile.id });
        const destination = await tx.findOne("accounts", { id: body.toAccountId, profileId: profile.id });
        if (!source || !destination) throw new Error("Conta de origem ou destino não encontrada.");
        if (!moneyGreaterOrEqual(source.balance, amount)) throw new Error("Saldo insuficiente na conta de origem.");

        const transfer = await tx.create("transfers", {
          profileId: profile.id,
          fromAccountId: source.id,
          toAccountId: destination.id,
          amount,
          occurredAt,
          description,
        });
        const outgoing = await tx.create("transactions", {
          profileId: profile.id,
          accountId: source.id,
          transferId: transfer.id,
          type: "transfer",
          amount,
          occurredAt,
          description: `Para ${destination.name}: ${description}`,
          origin,
        });
        await tx.create("transactions", {
          profileId: profile.id,
          accountId: destination.id,
          transferId: transfer.id,
          type: "transfer",
          amount,
          occurredAt,
          description: `De ${source.name}: ${description}`,
          origin,
        });
        await tx.update("accounts", source.id, { balance: moneySub(source.balance, amount), updatedAt: new Date() });
        await tx.update("accounts", destination.id, { balance: moneyAdd(destination.balance, amount), updatedAt: new Date() });
        return outgoing;
      });

      await logAction(profile.id, "created", "transfer", result.id, { amount });
      return Response.json(result, { status: 201 });
    }

    if (!body.accountId) throw new Error("Escolha uma conta.");
    const category = await getCategory(profile.id, body.categoryName, type);

    const result = await db.withTransaction(async (tx) => {
      const account = await tx.findOne("accounts", { id: body.accountId, profileId: profile.id });
      if (!account) throw new Error("Conta não encontrada.");

      const transaction = await tx.create("transactions", {
        profileId: profile.id,
        accountId: account.id,
        categoryId: category?.id ?? null,
        type,
        amount,
        occurredAt,
        description,
        note: body.note ? String(body.note) : null,
        origin,
      });
      const balance = type === "income" ? moneyAdd(account.balance, amount) : moneySub(account.balance, amount);
      await tx.update("accounts", account.id, { balance, updatedAt: new Date() });
      return transaction;
    });

    await logAction(profile.id, "created", "transaction", result.id, { type, amount });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
