import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { collectionNameOf, collections, collectionKeys, datetimeFields } from "../schema";
import type { Database, DatabaseInfo, QueryOptions, Row, Transaction } from "../types";
import { applyQuery, cloneRow, prepareRow } from "../values";

type Store = Record<string, Record<string, Row>>;

function emptyStore(): Store {
  const store: Store = {};
  for (const key of collectionKeys) store[collections[key].name] = {};
  return store;
}

/**
 * Caminho relativo resolvido pelo Node contra o diretório do processo.
 * Evitamos `process.cwd()` aqui de propósito: o rastreador de arquivos do
 * Next (NFT) entende isso como acesso dinâmico ao disco e passa a incluir o
 * projeto inteiro no pacote serverless da Vercel.
 */
const DEFAULT_STORAGE_PATH = ".data/gbr-bank-local.json";

function storagePath() {
  return process.env.LOCAL_DB_PATH || DEFAULT_STORAGE_PATH;
}

function serialize(store: Store) {
  const output: Record<string, Record<string, Row>> = {};
  for (const [name, rows] of Object.entries(store)) {
    output[name] = {};
    for (const [id, row] of Object.entries(rows)) {
      const copy: Row = {};
      for (const [field, value] of Object.entries(row)) copy[field] = value instanceof Date ? value.toISOString() : value;
      output[name][id] = copy;
    }
  }
  return output;
}

function deserialize(raw: unknown): Store {
  const store = emptyStore();
  if (!raw || typeof raw !== "object") return store;
  for (const key of collectionKeys) {
    const name = collections[key].name;
    const rows = (raw as Record<string, Record<string, Row>>)[name];
    if (!rows || typeof rows !== "object") continue;
    const dateFields = datetimeFields(key);
    for (const [id, row] of Object.entries(rows)) {
      const copy: Row = { ...row, id: row.id ?? id };
      for (const field of dateFields) {
        const value = copy[field];
        if (typeof value === "string" || typeof value === "number") {
          const parsed = new Date(value);
          copy[field] = Number.isNaN(parsed.getTime()) ? null : parsed;
        }
      }
      store[name][id] = copy;
    }
  }
  return store;
}

function deepClone(store: Store): Store {
  const copy = emptyStore();
  for (const [name, rows] of Object.entries(store)) {
    for (const [id, row] of Object.entries(rows)) copy[name][id] = cloneRow(row);
  }
  return copy;
}

/**
 * Banco local em arquivo (`.data/gbr-bank-local.json`).
 *
 * Permite desenvolver, testar e usar o painel sem credenciais do Firebase.
 * Não é um banco distribuído: os dados vivem apenas nesta máquina. Assim que
 * as variáveis do Firebase são configuradas, o app passa a usar o Firestore.
 */
export function createLocalDatabase(): Database {
  let store: Store | null = null;
  let loadedMtime = -1;
  let persistent = true;
  let writable: boolean | null = null;
  const globalForWarnings = globalThis as typeof globalThis & { __gbrBankLocalWarned?: boolean };

  function warnOnce(message: string) {
    if (globalForWarnings.__gbrBankLocalWarned) return;
    globalForWarnings.__gbrBankLocalWarned = true;
    console.warn(message);
  }

  function dirOf(file: string) {
    const index = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
    return index > 0 ? file.slice(0, index) : ".";
  }

  function fileMtime(file: string) {
    try {
      return fs.existsSync(/* turbopackIgnore: true */ file) ? fs.statSync(file).mtimeMs : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Relê o arquivo quando ele muda em disco. No desenvolvimento o Next cria
   * vários workers/registros de módulos, e sem isso cada um ficaria com uma
   * cópia antiga na memória.
   */
  function current(): Store {
    const file = storagePath();
    const mtime = fileMtime(file);
    if (store && mtime === loadedMtime) return store;
    try {
      store = mtime ? deserialize(JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file, "utf8"))) : emptyStore();
    } catch (error) {
      warnOnce(`[gbr-bank] Não foi possível ler o banco local (${(error as Error).message}); começando vazio.`);
      store = emptyStore();
    }
    loadedMtime = mtime;
    return store;
  }

  function persist() {
    if (!store) return;
    const file = storagePath();
    try {
      fs.mkdirSync(/* turbopackIgnore: true */ dirOf(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(/* turbopackIgnore: true */ tmp, JSON.stringify(serialize(store), null, 2));
      fs.renameSync(tmp, file);
      persistent = true;
      loadedMtime = fileMtime(file);
    } catch (error) {
      persistent = false;
      warnOnce(`[gbr-bank] Banco local apenas em memória — falha ao gravar ${file}: ${(error as Error).message}`);
    }
  }

  /** Detecta sistema de arquivos somente leitura (ex.: Vercel sem Firebase). */
  function probeWritable(): boolean {
    if (writable !== null) return writable;
    const file = storagePath();
    try {
      fs.mkdirSync(/* turbopackIgnore: true */ dirOf(file), { recursive: true });
      const probe = `${file}.probe`;
      fs.writeFileSync(/* turbopackIgnore: true */ probe, "");
      fs.rmSync(probe, { force: true });
      writable = true;
    } catch {
      writable = false;
    }
    return writable;
  }

  function assertWritable() {
    if (probeWritable()) return;
    throw new Error(
      "Banco de dados não configurado neste ambiente. O Firebase não está definido e o sistema de arquivos é somente leitura, então nada seria salvo. " +
        "Adicione FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY nas variáveis de ambiente e faça novo deploy " +
        "(passo a passo em docs/FIREBASE-SETUP.md).",
    );
  }

  function bucket(target: Store, collection: string) {
    const name = collectionNameOf(collection);
    target[name] ??= {};
    return { name, rows: target[name] };
  }

  /**
   * Cria um Transaction apontando para `target` (store real ou rascunho).
   * `onWrite` é chamado após cada gravação: no store real persiste em disco;
   * num rascunho de transação é neutro (só persistimos no commit).
   */
  function makeTx(target: Store, onWrite: () => void): Transaction {
    return {
      async get(collection, id) {
        const { rows } = bucket(target, collection);
        return rows[id] ? cloneRow(rows[id]) : null;
      },
      async findOne(collection, where) {
        const { name, rows } = bucket(target, collection);
        const found = applyQuery(Object.values(rows), { where, limit: 1 }, name);
        return found[0] ? cloneRow(found[0]) : null;
      },
      async list(collection, options?: QueryOptions) {
        const { name, rows } = bucket(target, collection);
        return applyQuery(Object.values(rows), options ?? {}, name).map(cloneRow);
      },
      async create(collection, values, id) {
        assertWritable();
        const { name, rows } = bucket(target, collection);
        const docId = id ?? (values.id ? String(values.id) : randomUUID());
        const row = prepareRow(name, { ...values, id: docId });
        rows[docId] = row;
        onWrite();
        return cloneRow(row);
      },
      async update(collection, id, values) {
        assertWritable();
        const { rows } = bucket(target, collection);
        const existing = rows[id];
        if (!existing) return null;
        const patch: Row = { ...values };
        delete patch.id;
        for (const field of Object.keys(patch)) if (patch[field] === undefined) patch[field] = null;
        const next: Row = { ...existing, ...patch, updatedAt: patch.updatedAt instanceof Date ? patch.updatedAt : new Date() };
        rows[id] = next;
        onWrite();
        return cloneRow(next);
      },
      async remove(collection, id) {
        assertWritable();
        const { rows } = bucket(target, collection);
        const existing = rows[id];
        if (!existing) return null;
        delete rows[id];
        onWrite();
        return cloneRow(existing);
      },
    };
  }

  return {
    get: (collection, id) => makeTx(current(), persist).get(collection, id),
    findOne: (collection, where) => makeTx(current(), persist).findOne(collection, where),
    list: (collection, options) => makeTx(current(), persist).list(collection, options),
    create: (collection, values, id) => makeTx(current(), persist).create(collection, values, id),
    update: (collection, id, values) => makeTx(current(), persist).update(collection, id, values),
    remove: (collection, id) => makeTx(current(), persist).remove(collection, id),
    async withTransaction(fn) {
      const draft = deepClone(current());
      const noop = () => {};
      const result = await fn(makeTx(draft, noop));
      store = draft;
      persist();
      return result;
    },
    info(): DatabaseInfo {
      current();
      return {
        mode: "local",
        label: persistent ? "Banco local em arquivo" : "Banco local só em memória",
        projectId: null,
        persistent,
        warning: persistent
          ? "Modo local: os dados ficam só nesta máquina. Configure o Firebase para acessar de qualquer lugar."
          : "Sistema de arquivos somente leitura: nada será salvo. Configure o Firebase (docs/FIREBASE-SETUP.md).",
      };
    },
  };
}
