import { db } from "@/db";
import { DEFAULT_PROFILE_ID, type Account, type Category, type Profile } from "@/db/schema";
import type { QueryOptions, Row } from "@/db/types";

export const incomeCategories = ["Serviços", "Clientes", "Salário", "Vendas", "Comissão", "Outros"];
export const expenseCategories = ["Alimentação", "Combustível", "Faculdade", "Carro", "Ferramentas", "Materiais", "Casa", "Lazer", "Assinaturas", "Dívidas", "Outros"];

/* ------------------------------- dinheiro ------------------------------- */
/*
 * Dinheiro é tratado em centavos (inteiros) para nunca depender de float.
 * Nas APIs e no banco o valor continua como string com 2 casas ("1234.56"),
 * exatamente como o PostgreSQL numeric devolvia.
 */

export function toCents(value: unknown): number {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("Informe um valor.");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error("Valor inválido.");
  return Math.round(parsed * 100);
}

export function fromCents(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

export function moneyNumber(value: unknown): number {
  const raw = String(value ?? "0").trim();
  if (!raw) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function moneySum(values: unknown[]): string {
  return fromCents(values.reduce((total: number, value: unknown) => total + safeCents(value), 0));
}

export function safeCents(value: unknown): number {
  try {
    return toCents(value);
  } catch {
    return 0;
  }
}

export function moneyAdd(left: unknown, right: unknown): string {
  return fromCents(safeCents(left) + safeCents(right));
}

export function moneySub(left: unknown, right: unknown): string {
  return fromCents(safeCents(left) - safeCents(right));
}

/** true quando `left` >= `right` (comparação exata em centavos). */
export function moneyGreaterOrEqual(left: unknown, right: unknown): boolean {
  return safeCents(left) >= safeCents(right);
}

export function positiveAmount(value: unknown): string {
  const cents = typeof value === "number" ? Math.round(value * 100) : toCents(value);
  if (!Number.isFinite(cents) || cents <= 0) throw new Error("Informe um valor maior que zero.");
  return fromCents(cents);
}

export function nonNegativeAmount(value: unknown): string {
  const cents = typeof value === "number" ? Math.round(value * 100) : toCents(value);
  if (!Number.isFinite(cents) || cents < 0) throw new Error("Informe um valor válido.");
  return fromCents(cents);
}

/* --------------------------------- datas --------------------------------- */

export function optionalDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Data inválida.");
  return date;
}

export function parseDateOnly(value: unknown): string | undefined {
  if (!value) return undefined;
  const result = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error("Data inválida.");
  return result;
}

/**
 * Chave "AAAA-MM-DD" no fuso do servidor. Use `TZ=America/Sao_Paulo` no
 * ambiente (local e Vercel) para que "hoje" e "este mês" batam com o seu dia.
 */
export function dayKey(value: Date | string | number | null | undefined): string | null {
  if (!value) return null;
  let date: Date;
  if (value instanceof Date) date = value;
  else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  else date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isSameDay(value: Date | string | null | undefined, reference: Date) {
  const left = dayKey(value);
  return left !== null && left === dayKey(reference);
}

export function isSameMonth(value: Date | string | null | undefined, reference: Date) {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth();
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

/* -------------------------------- consultas ------------------------------- */

export function byProfile(profileId: string, extra: Row = {}) {
  return { profileId, ...extra };
}

export async function listByProfile(collection: string, profileId: string, options: Omit<QueryOptions, "where"> & { where?: Row } = {}) {
  return db.list(collection, { ...options, where: byProfile(profileId, options.where ?? {}) });
}

/** Busca por id garantindo que pertence ao perfil. Retorna null se não existir. */
export async function findOwned(collection: string, id: string, profileId: string) {
  if (!id) return null;
  return db.findOne(collection, byProfile(profileId, { id }));
}

/* --------------------------------- perfil --------------------------------- */

export async function ensureProfile(): Promise<Profile> {
  const existing = await db.get("profiles", DEFAULT_PROFILE_ID);
  if (existing) return existing as unknown as Profile;

  return db.withTransaction(async (tx) => {
    const inside = await tx.get("profiles", DEFAULT_PROFILE_ID);
    if (inside) return inside as unknown as Profile;

    const profile = (await tx.create(
      "profiles",
      { username: "admin", name: "Gabriel", email: process.env.APP_ADMIN_EMAIL || "admin@gbrbank.local" },
      DEFAULT_PROFILE_ID,
    )) as unknown as Profile;

    for (const name of incomeCategories) {
      await tx.create("categories", { profileId: profile.id, name, kind: "income", isDefault: true, color: "#42d6b7" });
    }
    for (const name of expenseCategories) {
      await tx.create("categories", { profileId: profile.id, name, kind: "expense", isDefault: true, color: "#ff826e" });
    }

    const defaultAccounts: { name: string; type: Account["type"]; description: string }[] = [
      { name: "Carteira", type: "physical", description: "Dinheiro físico" },
      { name: "Banco", type: "digital", description: "Conta digital" },
      { name: "Reserva", type: "investment", description: "Poupança e investimentos" },
    ];
    for (const account of defaultAccounts) {
      await tx.create("accounts", { profileId: profile.id, name: account.name, type: account.type, balance: "0.00", description: account.description });
    }

    await tx.create("settings", { profileId: profile.id });
    await tx.create("personal_settlement", { profileId: profile.id });
    return profile;
  });
}

export async function getCategory(profileId: string, name: string | undefined, kind: "income" | "expense"): Promise<Category | null> {
  if (!name) return null;
  const [category] = await db.list("categories", { where: byProfile(profileId, { name, kind }), limit: 1 });
  return (category as unknown as Category) ?? null;
}

export async function logAction(profileId: string, action: string, entity: string, entityId?: string, metadata?: unknown) {
  try {
    await db.create("audit_logs", {
      profileId,
      action,
      entity,
      entityId: entityId ?? null,
      metadata: metadata === undefined ? null : JSON.stringify(metadata),
    });
  } catch (error) {
    // Auditoria nunca pode derrubar a operação principal.
    console.warn("[gbr-bank] falha ao registrar auditoria:", (error as Error).message);
  }
}

/* ---------------------------------- erros --------------------------------- */

/** Traduz erros conhecidos do Firebase em orientação prática. */
const errorHints: [RegExp, string][] = [
  [/Failed to parse private key/i, "A FIREBASE_PRIVATE_KEY deve ficar entre aspas duplas, numa linha só, com \\n no lugar das quebras de linha."],
  [/PERMISSION_DENIED|permission denied|insufficient permission/i, "Permissão negada: confira se a chave de conta de serviço pertence ao mesmo projeto do Firestore e se o banco foi criado."],
  [/UNAVAILABLE|network socket|Failed to fetch|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|getaddrinfo|Deadline Exceeded/i, "Não foi possível alcançar o Firestore: verifique a conexão de rede e se FIREBASE_PROJECT_ID está correto."],
  [/FAILED_PRECONDITION[\s\S]*index/i, "O Firestore pediu um índice composto: abra a URL indicada no console e clique em Criar índice."],
  [/Could not load the default credentials|Requested entity was not found|No such project|auth.*invalid/i, "Credenciais inválidas: confira FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY e FIREBASE_PROJECT_ID."],
  [/Firebase não configurado/i, "Preencha as variáveis FIREBASE_* no .env.local (local) ou na Vercel (produção) — guia em docs/FIREBASE-SETUP.md."],
];

export function explainError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Não foi possível concluir esta operação.";
  const hint = errorHints.find(([pattern]) => pattern.test(message))?.[1];
  return hint && !message.includes(hint) ? `${message} ${hint}` : message;
}

export function jsonError(error: unknown, status = 400) {
  if (!(error instanceof Error)) console.error("[gbr-bank] erro inesperado:", error);
  else if (status >= 500) console.error("[gbr-bank]", error.message);
  return Response.json({ error: explainError(error) }, { status });
}
