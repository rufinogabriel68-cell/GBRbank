/**
 * Esquema lógico do GBR Bank.
 *
 * O banco principal é o Cloud Firestore (Firebase). Este arquivo descreve as
 * coleções e o tipo de cada campo para que os drivers (Firestore e local)
 * saibam serializar datas, aplicar padrões e normalizar valores.
 *
 * Convenções mantidas da versão PostgreSQL:
 * - valores monetários são strings com 2 casas ("1234.56"), nunca float;
 * - campos de data simples (vencimento, prazo) são strings "AAAA-MM-DD";
 * - campos de data/hora são objetos Date (viram ISO no JSON das APIs).
 */

export type FieldKind = "string" | "number" | "boolean" | "datetime" | "date" | "money";

export type CollectionSchema = {
  /** Nome da coleção no Firestore. */
  name: string;
  fields: Record<string, FieldKind>;
  /** Valores aplicados quando o campo não vem no insert. */
  defaults?: Record<string, string | number | boolean | null>;
};

/**
 * O painel é de uso pessoal e abre direto no dashboard (sem tela de login),
 * então existe um único perfil, com id fixo. Isso evita perfis duplicados em
 * requisições simultâneas e facilita as regras de segurança.
 */
export const DEFAULT_PROFILE_ID = "default";

const stamps = { createdAt: "datetime", updatedAt: "datetime" } as const;

export const collections = {
  profiles: {
    name: "profiles",
    fields: { id: "string", username: "string", name: "string", email: "string", avatarUrl: "string", ...stamps },
    defaults: { username: "admin", name: "Gabriel", email: "admin@gbrbank.local", avatarUrl: null },
  },
  accounts: {
    name: "accounts",
    fields: { id: "string", profileId: "string", name: "string", type: "string", balance: "money", description: "string", status: "string", ...stamps },
    defaults: { type: "digital", balance: "0.00", description: null, status: "active" },
  },
  categories: {
    name: "categories",
    fields: { id: "string", profileId: "string", name: "string", kind: "string", color: "string", isDefault: "boolean", ...stamps },
    defaults: { color: "#8b9bb4", isDefault: false },
  },
  transfers: {
    name: "transfers",
    fields: { id: "string", profileId: "string", fromAccountId: "string", toAccountId: "string", amount: "money", occurredAt: "datetime", description: "string", ...stamps },
    defaults: { description: null },
  },
  transactions: {
    name: "transactions",
    fields: { id: "string", profileId: "string", accountId: "string", categoryId: "string", transferId: "string", type: "string", amount: "money", occurredAt: "datetime", description: "string", note: "string", origin: "string", ...stamps },
    defaults: { categoryId: null, transferId: null, description: null, note: null, origin: "personal" },
  },
  receivables: {
    name: "receivables",
    fields: { id: "string", profileId: "string", person: "string", description: "string", originalAmount: "money", dueDate: "date", status: "string", note: "string", ...stamps },
    defaults: { dueDate: null, status: "pending", note: null },
  },
  receivable_payments: {
    name: "receivable_payments",
    fields: { id: "string", profileId: "string", receivableId: "string", accountId: "string", transactionId: "string", amount: "money", paidAt: "datetime", ...stamps },
    defaults: { transactionId: null },
  },
  debts: {
    name: "debts",
    fields: { id: "string", profileId: "string", name: "string", creditor: "string", category: "string", originalAmount: "money", installments: "number", installmentAmount: "money", nextDueDate: "date", status: "string", note: "string", ...stamps },
    defaults: { category: "Outros", installments: null, installmentAmount: null, nextDueDate: null, status: "pending", note: null },
  },
  debt_payments: {
    name: "debt_payments",
    fields: { id: "string", profileId: "string", debtId: "string", accountId: "string", transactionId: "string", amount: "money", paidAt: "datetime", ...stamps },
    defaults: { transactionId: null },
  },
  bills: {
    name: "bills",
    fields: { id: "string", profileId: "string", name: "string", amount: "money", dueDate: "date", recurrence: "string", category: "string", status: "string", ...stamps },
    defaults: { recurrence: "none", category: "Outros", status: "pending" },
  },
  goals: {
    name: "goals",
    fields: { id: "string", profileId: "string", name: "string", targetAmount: "money", currentAmount: "money", deadline: "date", category: "string", note: "string", ...stamps },
    defaults: { currentAmount: "0.00", deadline: null, category: "Outros", note: null },
  },
  personal_settlement: {
    name: "personal_settlement",
    fields: { id: "string", profileId: "string", targetAmount: "money", savedAmount: "money", ...stamps },
    defaults: { targetAmount: "0.00", savedAmount: "0.00" },
  },
  settings: {
    name: "settings",
    fields: { id: "string", profileId: "string", currency: "string", locale: "string", theme: "string", ...stamps },
    defaults: { currency: "BRL", locale: "pt-BR", theme: "dark" },
  },
  audit_logs: {
    name: "audit_logs",
    fields: { id: "string", profileId: "string", action: "string", entity: "string", entityId: "string", metadata: "string", ...stamps },
    defaults: { entityId: null, metadata: null },
  },
} satisfies Record<string, CollectionSchema>;

export type CollectionKey = keyof typeof collections;

export const collectionKeys = Object.keys(collections) as CollectionKey[];

/** Campos de data/hora de uma coleção (usado para serializar/reviver). */
export function datetimeFields(key: CollectionKey) {
  return Object.entries(collections[key].fields)
    .filter(([, kind]) => kind === "datetime")
    .map(([field]) => field);
}

export function collectionNameOf(collection: string): string {
  const found = collectionKeys.find((key) => collections[key].name === collection || key === collection);
  if (!found) throw new Error(`Coleção desconhecida: ${collection}`);
  return collections[found].name;
}

export function getCollectionSchema(name: string): CollectionSchema {
  const found = collectionKeys.find((key) => collections[key].name === name || key === name);
  if (!found) throw new Error(`Coleção desconhecida: ${name}`);
  return collections[found];
}

export function collectionKeyOf(name: string): CollectionKey {
  const found = collectionKeys.find((key) => collections[key].name === name || key === name);
  if (!found) throw new Error(`Coleção desconhecida: ${name}`);
  return found;
}

/* ------------------------------------------------------------------ */
/* Tipos das linhas retornadas pelas APIs                              */
/* ------------------------------------------------------------------ */

export type Money = string | number;

type Base = { id: string; profileId: string; createdAt: Date; updatedAt: Date };

export type Profile = { id: string; username: string; name: string; email: string; avatarUrl: string | null; createdAt: Date; updatedAt: Date };
export type Account = Base & { name: string; type: "physical" | "digital" | "investment" | "other" | string; balance: Money; description: string | null; status: "active" | "archived" | string };
export type Category = Base & { name: string; kind: "income" | "expense" | string; color: string; isDefault: boolean };
export type Transfer = Base & { fromAccountId: string; toAccountId: string; amount: Money; occurredAt: Date; description: string | null };
export type Transaction = Base & { accountId: string; categoryId: string | null; transferId: string | null; type: "income" | "expense" | "transfer" | string; amount: Money; occurredAt: Date; description: string | null; note: string | null; origin: "personal" | "gbr" | string };
export type Receivable = Base & { person: string; description: string; originalAmount: Money; dueDate: string | null; status: string; note: string | null };
export type ReceivablePayment = Base & { receivableId: string; accountId: string; transactionId: string | null; amount: Money; paidAt: Date };
export type Debt = Base & { name: string; creditor: string; category: string; originalAmount: Money; installments: number | null; installmentAmount: Money | null; nextDueDate: string | null; status: string; note: string | null };
export type DebtPayment = Base & { debtId: string; accountId: string; transactionId: string | null; amount: Money; paidAt: Date };
export type Bill = Base & { name: string; amount: Money; dueDate: string; recurrence: string; category: string; status: string };
export type Goal = Base & { name: string; targetAmount: Money; currentAmount: Money; deadline: string | null; category: string; note: string | null };
export type PersonalSettlement = Base & { targetAmount: Money; savedAmount: Money };
export type SettingsRow = Base & { currency: string; locale: string; theme: string };
export type AuditLog = Base & { action: string; entity: string; entityId: string | null; metadata: string | null };

export const accountTypes = ["physical", "digital", "investment", "other"] as const;
export const accountStatuses = ["active", "archived"] as const;
export const transactionTypes = ["income", "expense", "transfer"] as const;
export const categoryKinds = ["income", "expense"] as const;
export const origins = ["personal", "gbr"] as const;
export const receivableStatuses = ["pending", "partial", "received", "overdue"] as const;
export const debtStatuses = ["pending", "partial", "paid", "overdue"] as const;
export const billStatuses = ["pending", "paid", "overdue"] as const;
