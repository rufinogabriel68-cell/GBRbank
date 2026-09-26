import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, type DocumentSnapshot, type Firestore, type Query, type QuerySnapshot, type Transaction as FirestoreTransaction } from "firebase-admin/firestore";
import { collectionKeyOf, collectionNameOf, datetimeFields } from "../schema";
import type { Database, DatabaseInfo, QueryOptions, Row, Transaction as DbTransaction } from "../types";
import { prepareRow, sortRows } from "../values";

export type FirebaseConfig = {
  projectId: string;
  clientEmail?: string;
  privateKey?: string;
};

function normalizePrivateKey(key: string) {
  return key.replace(/\\n/g, "\n").replace(/"/g, "").trim();
}

/**
 * Lê a configuração do Firebase das variáveis de ambiente.
 * Aceita três formatos:
 *  1. FIREBASE_SERVICE_ACCOUNT_JSON — conteúdo do arquivo-chave (JSON ou base64);
 *  2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY;
 *  3. GOOGLE_APPLICATION_CREDENTIALS — caminho do arquivo-chave (ADC).
 */
export function readFirebaseConfig(): FirebaseConfig | null {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawServiceAccount) {
    let json = rawServiceAccount;
    if (!json.startsWith("{")) {
      try {
        json = Buffer.from(rawServiceAccount, "base64").toString("utf8");
      } catch {
        json = rawServiceAccount;
      }
    }
    try {
      const parsed = JSON.parse(json) as Record<string, string>;
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: normalizePrivateKey(parsed.private_key),
        };
      }
      console.error("[gbr-bank] FIREBASE_SERVICE_ACCOUNT_JSON incompleto (esperado project_id, client_email e private_key).");
    } catch (error) {
      console.error("[gbr-bank] FIREBASE_SERVICE_ACCOUNT_JSON inválido:", (error as Error).message);
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey: normalizePrivateKey(privateKey) };
  }
  if (projectId && process.env.GOOGLE_APPLICATION_CREDENTIALS) return { projectId };

  return null;
}

export function hasFirestoreCredentials() {
  return readFirebaseConfig() !== null;
}

let app: App | null = null;
let firestore: Firestore | null = null;
let initError: string | null = null;

export function getDb(): Firestore {
  if (firestore) return firestore;
  if (initError) throw new Error(initError);

  const config = readFirebaseConfig();
  if (!config) {
    initError = "Firebase não configurado: defina FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY (ou FIREBASE_SERVICE_ACCOUNT_JSON) no ambiente do servidor.";
    throw new Error(initError);
  }

  try {
    app = getApps()[0] ?? null;
    if (!app) {
      app = config.clientEmail && config.privateKey
        ? initializeApp({
            credential: cert({ projectId: config.projectId, clientEmail: config.clientEmail, privateKey: config.privateKey }),
            projectId: config.projectId,
          })
        : initializeApp({ projectId: config.projectId });
    }
    firestore = getFirestore(app);
    return firestore;
  } catch (error) {
    initError = `Falha ao iniciar o Firebase Admin: ${(error as Error).message}`;
    firestore = null;
    app = null;
    throw new Error(initError);
  }
}

/* --------------------------- serialização --------------------------- */

function dateFieldsOf(collection: string) {
  return datetimeFields(collectionKeyOf(collection));
}

/** Documento do Firestore -> Row usado pelas rotas (Timestamp vira Date). */
function toRow(collection: string, snapshot: DocumentSnapshot): Row | null {
  const data = snapshot.data();
  if (!data) return null;
  const row: Row = { ...data, id: snapshot.id };
  for (const field of dateFieldsOf(collection)) {
    const value = row[field];
    if (value instanceof Timestamp) row[field] = value.toDate();
    else if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      row[field] = Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  return row;
}

/** Row -> objeto gravável (Date vira Timestamp, undefined vira null, id sai). */
function toPayload(collection: string, values: Row, options: { applyDefaults: boolean }): Row {
  const prepared = options.applyDefaults ? prepareRow(collection, values) : { ...values };
  const dateFields = new Set(dateFieldsOf(collection));
  const payload: Row = {};
  for (const [field, value] of Object.entries(prepared)) {
    if (field === "id") continue;
    if (value === undefined || value === null) {
      payload[field] = null;
    } else if (value instanceof Date) {
      payload[field] = Number.isNaN(value.getTime()) ? null : Timestamp.fromDate(value);
    } else if (dateFields.has(field) && (typeof value === "string" || typeof value === "number")) {
      const parsed = new Date(value);
      payload[field] = Number.isNaN(parsed.getTime()) ? null : Timestamp.fromDate(parsed);
    } else {
      payload[field] = value;
    }
  }
  return payload;
}

function documentOf(collection: string, id: string) {
  return getDb().collection(collectionNameOf(collection)).doc(id);
}

function buildQuery(collection: string, where: Row = {}): Query {
  let query = getDb().collection(collectionNameOf(collection)) as Query;
  for (const [field, value] of Object.entries(where)) {
    query = query.where(field, "==", value ?? null);
  }
  return query;
}

/* ------------------------------ resiliência ------------------------------ */

/**
 * Sem isso, uma falha de rede/credencial faz o Firestore tentar reconectar por
 * ~48s — na Vercel isso vira um timeout sem mensagem nenhuma. O limite padrão
 * de 8s devolve um erro claro antes do limite da função serverless.
 */
const OPERATION_TIMEOUT_MS = Number(process.env.FIRESTORE_TIMEOUT_MS ?? 8000);
const TRANSACTION_TIMEOUT_MS = Number(process.env.FIRESTORE_TRANSACTION_TIMEOUT_MS ?? 9000);

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Tempo esgotado (${Math.round(ms / 1000)}s) ao ${label}. Verifique a conexão com o Firestore e as credenciais do Firebase.`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/* ------------------------------ driver ------------------------------ */

/**
 * Driver Cloud Firestore (Firebase).
 *
 * Decisões de projeto:
 * - filtros de igualdade são enviados ao Firestore (índices de campo único são
 *   criados automaticamente, sem configuração);
 * - ordenação e limite são resolvidos aqui, o que dispensa índices compostos —
 *   a principal causa de erro "9: FAILED_PRECONDITION" em produção;
 * - dinheiro é gravado como string com 2 casas, nunca float;
 * - `withTransaction` usa a transação nativa do Firestore (atômica).
 */
export function createFirestoreDatabase(): Database {
  /** `tx` é null fora de uma transação. */
  function makeTx(tx: FirestoreTransaction | null): DbTransaction {
    async function readSnapshot(id: string, collection: string): Promise<DocumentSnapshot> {
      const reference = documentOf(collection, id);
      return tx ? tx.get(reference) : reference.get();
    }

    async function readQuery(collection: string, options: QueryOptions): Promise<Row[]> {
      const name = collectionNameOf(collection);
      const query = buildQuery(collection, options.where ?? {});
      const snapshot: QuerySnapshot = tx ? await tx.get(query as never) : await query.get();
      const rows = snapshot.docs.map((doc) => toRow(name, doc)).filter((row): row is Row => row !== null);
      const sorted = sortRows(rows, options.orderBy ?? [], name);
      return typeof options.limit === "number" && options.limit >= 0 ? sorted.slice(0, options.limit) : sorted;
    }

    return {
      async get(collection, id) {
        return toRow(collectionNameOf(collection), await readSnapshot(id, collection));
      },

      async findOne(collection, where) {
        const rows = await readQuery(collection, { where, limit: 1 });
        return rows[0] ?? null;
      },

      async list(collection, options) {
        return readQuery(collection, options ?? {});
      },

      async create(collection, values, id) {
        const name = collectionNameOf(collection);
        const reference = id ? documentOf(collection, id) : getDb().collection(name).doc();
        const payload = toPayload(name, { ...values, id: reference.id }, { applyDefaults: true });
        if (tx) tx.set(reference, payload);
        else await reference.set(payload);
        // Devolve a linha como ela ficou, sem precisar de nova leitura
        // (dentro de transação não é permitido ler depois de gravar).
        const restored: Row = { id: reference.id };
        for (const [field, value] of Object.entries(payload)) restored[field] = value instanceof Timestamp ? value.toDate() : value;
        return restored;
      },

      async update(collection, id, values) {
        const name = collectionNameOf(collection);
        const reference = documentOf(collection, id);
        const snapshot = await readSnapshot(id, collection);
        const current = toRow(name, snapshot);
        if (!current) return null;

        const patch: Row = { ...values };
        delete patch.id;
        const payload = toPayload(name, patch, { applyDefaults: false });
        if (!Object.keys(payload).length) return current;

        if (tx) tx.update(reference, payload);
        else await reference.update(payload);

        const merged: Row = { ...current };
        for (const [field, value] of Object.entries(payload)) merged[field] = value instanceof Timestamp ? value.toDate() : value;
        merged.id = id;
        return merged;
      },

      async remove(collection, id) {
        const name = collectionNameOf(collection);
        const snapshot = await readSnapshot(id, collection);
        const previous = toRow(name, snapshot);
        if (!previous) return null;
        const reference = documentOf(collection, id);
        if (tx) tx.delete(reference);
        else await reference.delete();
        return previous;
      },
    };
  }

  const direct = makeTx(null);

  return {
    get: (collection, id) => withTimeout(direct.get(collection, id), OPERATION_TIMEOUT_MS, `ler ${collection}`),
    findOne: (collection, where) => withTimeout(direct.findOne(collection, where), OPERATION_TIMEOUT_MS, `consultar ${collection}`),
    list: (collection, options) => withTimeout(direct.list(collection, options), OPERATION_TIMEOUT_MS, `listar ${collection}`),
    create: (collection, values, id) => withTimeout(direct.create(collection, values, id), OPERATION_TIMEOUT_MS, `gravar em ${collection}`),
    update: (collection, id, values) => withTimeout(direct.update(collection, id, values), OPERATION_TIMEOUT_MS, `atualizar ${collection}`),
    remove: (collection, id) => withTimeout(direct.remove(collection, id), OPERATION_TIMEOUT_MS, `remover de ${collection}`),
    withTransaction(fn) {
      return withTimeout(getDb().runTransaction((transaction) => fn(makeTx(transaction))), TRANSACTION_TIMEOUT_MS, "concluir a transação no Firestore");
    },
    info(): DatabaseInfo {
      const config = readFirebaseConfig();
      return {
        mode: "firestore",
        label: "Cloud Firestore",
        projectId: config?.projectId ?? null,
        persistent: true,
        warning: null,
      };
    },
  };
}
