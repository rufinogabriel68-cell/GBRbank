import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions, transfers } from "@/db/schema";
import { ensureProfile, getCategory, jsonError, logAction, optionalDate, positiveAmount } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const profile = await ensureProfile();
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.toLowerCase();
    const rows = await db.select({ transaction: transactions, accountName: accounts.name, categoryName: categories.name }).from(transactions).leftJoin(accounts, eq(accounts.id, transactions.accountId)).leftJoin(categories, eq(categories.id, transactions.categoryId)).where(eq(transactions.profileId, profile.id)).orderBy(desc(transactions.occurredAt)).limit(500);
    return Response.json(search ? rows.filter((row) => `${row.transaction.description ?? ""} ${row.accountName ?? ""} ${row.categoryName ?? ""}`.toLowerCase().includes(search)) : rows);
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const profile = await ensureProfile();
    const type = body.type;
    const amount = positiveAmount(body.amount);
    const description = String(body.description ?? "").trim() || (type === "income" ? "Entrada" : type === "expense" ? "Saída" : "Transferência");
    const occurredAt = optionalDate(body.occurredAt) ?? new Date();
    if (!["income", "expense", "transfer"].includes(type)) throw new Error("Tipo de movimentação inválido.");

    const result = await db.transaction(async (tx) => {
      if (type === "transfer") {
        if (!body.fromAccountId || !body.toAccountId || body.fromAccountId === body.toAccountId) throw new Error("Escolha contas de origem e destino diferentes.");
        const source = await tx.select().from(accounts).where(and(eq(accounts.id, body.fromAccountId), eq(accounts.profileId, profile.id))).limit(1);
        const destination = await tx.select().from(accounts).where(and(eq(accounts.id, body.toAccountId), eq(accounts.profileId, profile.id))).limit(1);
        if (!source[0] || !destination[0]) throw new Error("Conta de origem ou destino não encontrada.");
        if (Number(source[0].balance) < Number(amount)) throw new Error("Saldo insuficiente na conta de origem.");
        const [transfer] = await tx.insert(transfers).values({ profileId: profile.id, fromAccountId: body.fromAccountId, toAccountId: body.toAccountId, amount, occurredAt, description }).returning();
        const [outgoing] = await tx.insert(transactions).values({ profileId: profile.id, accountId: body.fromAccountId, transferId: transfer.id, type: "transfer", amount, occurredAt, description: `Para ${destination[0].name}: ${description}`, origin: body.origin === "gbr" ? "gbr" : "personal" }).returning();
        await tx.insert(transactions).values({ profileId: profile.id, accountId: body.toAccountId, transferId: transfer.id, type: "transfer", amount, occurredAt, description: `De ${source[0].name}: ${description}`, origin: body.origin === "gbr" ? "gbr" : "personal" });
        await tx.update(accounts).set({ balance: sql`${accounts.balance} - ${amount}`, updatedAt: new Date() }).where(eq(accounts.id, body.fromAccountId));
        await tx.update(accounts).set({ balance: sql`${accounts.balance} + ${amount}`, updatedAt: new Date() }).where(eq(accounts.id, body.toAccountId));
        return outgoing;
      }
      if (!body.accountId) throw new Error("Escolha uma conta.");
      const account = await tx.select().from(accounts).where(and(eq(accounts.id, body.accountId), eq(accounts.profileId, profile.id))).limit(1);
      if (!account[0]) throw new Error("Conta não encontrada.");
      const category = await getCategory(profile.id, body.categoryName, type);
      const [transaction] = await tx.insert(transactions).values({ profileId: profile.id, accountId: body.accountId, categoryId: category?.id, type, amount, occurredAt, description, note: body.note ? String(body.note) : undefined, origin: body.origin === "gbr" ? "gbr" : "personal" }).returning();
      const delta = type === "income" ? sql`${accounts.balance} + ${amount}` : sql`${accounts.balance} - ${amount}`;
      await tx.update(accounts).set({ balance: delta, updatedAt: new Date() }).where(eq(accounts.id, body.accountId));
      return transaction;
    });
    await logAction(profile.id, "created", "transaction", result.id, { type, amount });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
