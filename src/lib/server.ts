import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, auditLogs, categories, personalSettlement, profiles, settings } from "@/db/schema";

export const incomeCategories = ["Serviços", "Clientes", "Salário", "Vendas", "Comissão", "Outros"];
export const expenseCategories = ["Alimentação", "Combustível", "Faculdade", "Carro", "Ferramentas", "Materiais", "Casa", "Lazer", "Assinaturas", "Dívidas", "Outros"];

export async function ensureProfile() {
  const existing = await db.select().from(profiles).limit(1);
  if (existing[0]) return existing[0];

  const [profile] = await db.insert(profiles).values({
    username: "admin",
    name: "Gabriel",
    email: "admin@gbrbank.local",
  }).returning();

  await db.insert(categories).values([
    ...incomeCategories.map((name) => ({ profileId: profile.id, name, kind: "income" as const, isDefault: true, color: "#42d6b7" })),
    ...expenseCategories.map((name) => ({ profileId: profile.id, name, kind: "expense" as const, isDefault: true, color: "#ff826e" })),
  ]);
  await db.insert(accounts).values([
    { profileId: profile.id, name: "Carteira", type: "physical", balance: "0", description: "Dinheiro físico" },
    { profileId: profile.id, name: "Banco", type: "digital", balance: "0", description: "Conta digital" },
    { profileId: profile.id, name: "Reserva", type: "investment", balance: "0", description: "Poupança e investimentos" },
  ]);
  await db.insert(settings).values({ profileId: profile.id });
  await db.insert(personalSettlement).values({ profileId: profile.id });
  return profile;
}

function numericValue(value: unknown) {
  const raw = String(value ?? "").trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  return Number(normalized);
}

export function positiveAmount(value: unknown) {
  const amount = typeof value === "number" ? value : numericValue(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Informe um valor maior que zero.");
  return amount.toFixed(2);
}

export function nonNegativeAmount(value: unknown) {
  const amount = typeof value === "number" ? value : numericValue(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Informe um valor válido.");
  return amount.toFixed(2);
}

export function optionalDate(value: unknown) {
  if (!value) return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Data inválida.");
  return date;
}

export function parseDateOnly(value: unknown) {
  if (!value) return undefined;
  const result = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error("Data inválida.");
  return result;
}

export async function logAction(profileId: string, action: string, entity: string, entityId?: string, metadata?: unknown) {
  await db.insert(auditLogs).values({
    profileId,
    action,
    entity,
    entityId,
    metadata: metadata ? JSON.stringify(metadata) : undefined,
  });
}

export function jsonError(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Não foi possível concluir esta operação.";
  return Response.json({ error: message }, { status });
}

export function moneyNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

export function startOfDay(date = new Date()) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function startOfMonth(date = new Date()) {
  const result = new Date(date.getFullYear(), date.getMonth(), 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

export async function getCategory(profileId: string, name: string | undefined, kind: "income" | "expense") {
  if (!name) return undefined;
  const [category] = await db.select().from(categories).where(and(eq(categories.profileId, profileId), eq(categories.name, name), eq(categories.kind, kind))).limit(1);
  return category;
}
