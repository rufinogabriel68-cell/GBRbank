import { collections, collectionKeyOf, datetimeFields, type CollectionKey, type CollectionSchema, type FieldKind } from "./schema";
import type { OrderDirection, QueryOptions, Row } from "./types";

function schemaOf(collection: string): { key: CollectionKey; schema: CollectionSchema } {
  const key: CollectionKey = collectionKeyOf(collection);
  return { key, schema: collections[key] as CollectionSchema };
}

/**
 * Preenche padrões do esquema, garante `createdAt`/`updatedAt` e troca
 * `undefined` por `null` (o Firestore rejeita `undefined`).
 */
export function prepareRow(collection: string, values: Row): Row {
  const { key, schema } = schemaOf(collection);
  const now = new Date();
  const result: Row = { ...values };

  for (const [field, fallback] of Object.entries(schema.defaults ?? {})) {
    if (result[field] === undefined) result[field] = fallback;
  }
  for (const field of datetimeFields(key)) {
    if (result[field] === undefined || result[field] === null) result[field] = now;
  }
  for (const field of Object.keys(result)) {
    if (result[field] === undefined) result[field] = null;
  }
  return result;
}

export function fieldKind(collection: string, field: string): FieldKind | undefined {
  const { schema } = schemaOf(collection);
  return schema.fields[field];
}

function comparable(value: unknown): number | string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  const asNumber = Number(String(value).replace(",", "."));
  return Number.isFinite(asNumber) && /^-?\d+([.,]\d+)?$/.test(String(value).trim()) ? asNumber : String(value);
}

/** Ordenação com a mesma semântica do PostgreSQL: ASC com nulos por último, DESC com nulos primeiro. */
export function sortRows(rows: Row[], orderBy: { field: string; direction: OrderDirection }[] = [], collection?: string): Row[] {
  if (!orderBy.length) return rows;
  const numericFields = new Set<string>();
  if (collection) {
    for (const { field } of orderBy) {
      const kind = fieldKind(collection, field);
      if (kind === "money" || kind === "number" || kind === "datetime") numericFields.add(field);
    }
  }
  return [...rows].sort((a, b) => {
    for (const { field, direction } of orderBy) {
      const left = comparable(a[field]);
      const right = comparable(b[field]);
      if (left === null && right === null) continue;
      if (left === null) return direction === "asc" ? 1 : -1;
      if (right === null) return direction === "asc" ? -1 : 1;
      const bothNumeric = numericFields.has(field) || (typeof left === "number" && typeof right === "number");
      let comparison: number;
      if (bothNumeric) comparison = Number(left) - Number(right);
      else comparison = String(left).localeCompare(String(right));
      if (comparison !== 0) return direction === "asc" ? comparison : -comparison;
    }
    return 0;
  });
}

export function matchesWhere(row: Row, where: Row = {}) {
  return Object.entries(where).every(([field, expected]) => {
    const actual = row[field];
    if (expected === null || expected === undefined) return actual === null || actual === undefined || actual === "";
    if (expected instanceof Date && actual instanceof Date) return expected.getTime() === actual.getTime();
    return actual === expected;
  });
}

export function applyQuery(rows: Row[], options: QueryOptions = {}, collection?: string) {
  let result = rows.filter((row) => matchesWhere(row, options.where ?? {}));
  result = sortRows(result, options.orderBy ?? [], collection);
  if (typeof options.limit === "number" && options.limit >= 0) result = result.slice(0, options.limit);
  return result;
}

export function cloneRow(row: Row): Row {
  const copy: Row = {};
  for (const [field, value] of Object.entries(row)) {
    copy[field] = value instanceof Date ? new Date(value.getTime()) : value;
  }
  return copy;
}
