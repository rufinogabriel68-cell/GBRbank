import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const accountTypeEnum = pgEnum("account_type", ["physical", "digital", "investment", "other"]);
export const accountStatusEnum = pgEnum("account_status", ["active", "archived"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["income", "expense", "transfer"]);
export const categoryKindEnum = pgEnum("category_kind", ["income", "expense"]);
export const originEnum = pgEnum("origin", ["personal", "gbr"]);
export const receivableStatusEnum = pgEnum("receivable_status", ["pending", "partial", "received", "overdue"]);
export const debtStatusEnum = pgEnum("debt_status", ["pending", "partial", "paid", "overdue"]);
export const billStatusEnum = pgEnum("bill_status", ["pending", "paid", "overdue"]);

export const profiles = pgTable("profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: varchar("username", { length: 80 }).notNull().default("admin"),
  name: varchar("name", { length: 120 }).notNull().default("Gabriel"),
  email: varchar("email", { length: 180 }).notNull().default("admin@gbrbank.local"),
  avatarUrl: text("avatar_url"),
  ...timestamps,
}, (table) => ({ usernameIdx: uniqueIndex("profiles_username_idx").on(table.username) }));

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  type: accountTypeEnum("type").notNull().default("digital"),
  balance: numeric("balance", { precision: 14, scale: 2 }).notNull().default("0"),
  description: text("description"),
  status: accountStatusEnum("status").notNull().default("active"),
  ...timestamps,
}, (table) => ({ profileIdx: index("accounts_profile_idx").on(table.profileId), statusIdx: index("accounts_status_idx").on(table.status) }));

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(),
  kind: categoryKindEnum("kind").notNull(),
  color: varchar("color", { length: 20 }).notNull().default("#8b9bb4"),
  isDefault: boolean("is_default").notNull().default(false),
  ...timestamps,
}, (table) => ({ profileKindIdx: index("categories_profile_kind_idx").on(table.profileId, table.kind) }));

export const transfers = pgTable("transfers", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  fromAccountId: uuid("from_account_id").notNull().references(() => accounts.id),
  toAccountId: uuid("to_account_id").notNull().references(() => accounts.id),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  description: text("description"),
  ...timestamps,
}, (table) => ({ profileDateIdx: index("transfers_profile_date_idx").on(table.profileId, table.occurredAt) }));

export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  transferId: uuid("transfer_id").references(() => transfers.id, { onDelete: "set null" }),
  type: transactionTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  description: text("description"),
  note: text("note"),
  origin: originEnum("origin").notNull().default("personal"),
  ...timestamps,
}, (table) => ({ profileDateIdx: index("transactions_profile_date_idx").on(table.profileId, table.occurredAt), accountIdx: index("transactions_account_idx").on(table.accountId), categoryIdx: index("transactions_category_idx").on(table.categoryId) }));

export const receivables = pgTable("receivables", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  person: varchar("person", { length: 140 }).notNull(),
  description: text("description").notNull(),
  originalAmount: numeric("original_amount", { precision: 14, scale: 2 }).notNull(),
  dueDate: date("due_date"),
  status: receivableStatusEnum("status").notNull().default("pending"),
  note: text("note"),
  ...timestamps,
}, (table) => ({ profileStatusIdx: index("receivables_profile_status_idx").on(table.profileId, table.status), dueDateIdx: index("receivables_due_date_idx").on(table.dueDate) }));

export const receivablePayments = pgTable("receivable_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  receivableId: uuid("receivable_id").notNull().references(() => receivables.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id),
  transactionId: uuid("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
}, (table) => ({ receivableIdx: index("receivable_payments_receivable_idx").on(table.receivableId) }));

export const debts = pgTable("debts", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 140 }).notNull(),
  creditor: varchar("creditor", { length: 140 }).notNull(),
  category: varchar("category", { length: 80 }).notNull().default("Outros"),
  originalAmount: numeric("original_amount", { precision: 14, scale: 2 }).notNull(),
  installments: integer("installments"),
  installmentAmount: numeric("installment_amount", { precision: 14, scale: 2 }),
  nextDueDate: date("next_due_date"),
  status: debtStatusEnum("status").notNull().default("pending"),
  note: text("note"),
  ...timestamps,
}, (table) => ({ profileStatusIdx: index("debts_profile_status_idx").on(table.profileId, table.status), dueDateIdx: index("debts_due_date_idx").on(table.nextDueDate) }));

export const debtPayments = pgTable("debt_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  debtId: uuid("debt_id").notNull().references(() => debts.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id),
  transactionId: uuid("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
}, (table) => ({ debtIdx: index("debt_payments_debt_idx").on(table.debtId) }));

export const bills = pgTable("bills", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 140 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  dueDate: date("due_date").notNull(),
  recurrence: varchar("recurrence", { length: 30 }).notNull().default("none"),
  category: varchar("category", { length: 80 }).notNull().default("Outros"),
  status: billStatusEnum("status").notNull().default("pending"),
  ...timestamps,
}, (table) => ({ profileStatusIdx: index("bills_profile_status_idx").on(table.profileId, table.status), dueDateIdx: index("bills_due_date_idx").on(table.dueDate) }));

export const goals = pgTable("goals", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 140 }).notNull(),
  targetAmount: numeric("target_amount", { precision: 14, scale: 2 }).notNull(),
  currentAmount: numeric("current_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  deadline: date("deadline"),
  category: varchar("category", { length: 80 }).notNull().default("Outros"),
  note: text("note"),
  ...timestamps,
}, (table) => ({ profileIdx: index("goals_profile_idx").on(table.profileId) }));

export const personalSettlement = pgTable("personal_settlement", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  targetAmount: numeric("target_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  savedAmount: numeric("saved_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  ...timestamps,
}, (table) => ({ profileUniqueIdx: uniqueIndex("personal_settlement_profile_idx").on(table.profileId) }));

export const settings = pgTable("settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  currency: varchar("currency", { length: 8 }).notNull().default("BRL"),
  locale: varchar("locale", { length: 20 }).notNull().default("pt-BR"),
  theme: varchar("theme", { length: 20 }).notNull().default("dark"),
  ...timestamps,
}, (table) => ({ profileUniqueIdx: uniqueIndex("settings_profile_idx").on(table.profileId) }));

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 80 }).notNull(),
  entity: varchar("entity", { length: 80 }).notNull(),
  entityId: uuid("entity_id"),
  metadata: text("metadata"),
  ...timestamps,
}, (table) => ({ profileDateIdx: index("audit_logs_profile_date_idx").on(table.profileId, table.createdAt) }));
