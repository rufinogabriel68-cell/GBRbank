import { createFirestoreDatabase, hasFirestoreCredentials, readFirebaseConfig } from "./drivers/firestore";
import { createLocalDatabase } from "./drivers/local";
import type { Database } from "./types";

const globalForDb = globalThis as typeof globalThis & { __gbrBankDb?: Database; __gbrBankDbLogged?: boolean };

/**
 * Escolhe o banco ativo:
 * - com credenciais do Firebase -> Cloud Firestore (dados na nuvem, acesso remoto);
 * - sem credenciais -> banco local em arquivo (desenvolvimento/degustação).
 */
function createDatabase(): Database {
  if (hasFirestoreCredentials()) {
    const config = readFirebaseConfig();
    if (!globalForDb.__gbrBankDbLogged) {
      globalForDb.__gbrBankDbLogged = true;
      console.log(`[gbr-bank] Banco ativo: Cloud Firestore (projeto ${config?.projectId})`);
    }
    return createFirestoreDatabase();
  }
  if (!globalForDb.__gbrBankDbLogged) {
    globalForDb.__gbrBankDbLogged = true;
    console.warn("[gbr-bank] Firebase não configurado — usando banco local em .data/gbr-bank-local.json. Configure as variáveis FIREBASE_* para ter acesso remoto (docs/FIREBASE-SETUP.md).");
  }
  return createLocalDatabase();
}

export const db: Database = globalForDb.__gbrBankDb ?? createDatabase();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__gbrBankDb = db;
}

export const dbInfo = () => db.info();

export * from "./types";
