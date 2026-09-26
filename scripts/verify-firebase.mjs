#!/usr/bin/env node
/**
 * Teste rápido da conexão com o Firebase.
 *
 *   npm run verify:firebase
 *
 * Verifica credenciais, conectividade, leitura e escrita no Firestore sem
 * tocar nos seus dados reais (usa uma coleção temporária `_healthcheck`).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value.replace(/\\n/g, "\n");
  }
}

for (const file of [".env.local", ".env"]) loadEnvFile(path.resolve(process.cwd(), file));

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

const step = (label) => process.stdout.write(`${label} ... `);
const ok = (extra = "") => console.log(`\x1b[32mok\x1b[0m ${extra}`);
const fail = (message) => {
  console.log(`\x1b[31mfalhou\x1b[0m\n\n  ${message}\n`);
  process.exit(1);
};

step("1/5 variáveis de ambiente");
if (!projectId) fail("FIREBASE_PROJECT_ID não definido. Copie .env.example para .env.local e preencha.");
if (!serviceAccount && (!clientEmail || !privateKey)) {
  fail("Faltam credenciais: defina FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (ou FIREBASE_SERVICE_ACCOUNT_JSON).");
}
ok(`projeto ${projectId}`);

step("2/5 firebase-admin");
let cert;
let initializeApp;
let getFirestore;
let Timestamp;
try {
  ({ cert, initializeApp } = await import("firebase-admin/app"));
  ({ getFirestore, Timestamp } = await import("firebase-admin/firestore"));
} catch (error) {
  fail(`firebase-admin não instalado: ${error.message}\n  Rode: npm install`);
}
ok("importado");

step("3/5 autenticação");
let db;
try {
  const credential = serviceAccount
    ? cert(JSON.parse(serviceAccount.startsWith("{") ? serviceAccount : Buffer.from(serviceAccount, "base64").toString("utf8")))
    : cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") });
  db = getFirestore(initializeApp({ credential, projectId }));
} catch (error) {
  fail(`Não foi possível iniciar o Firebase Admin: ${error.message}`);
}
ok("credenciais aceitas");

step("4/5 escrita no Firestore");
const probe = db.collection("_healthcheck").doc("ping");
try {
  await probe.set({ at: Timestamp.fromDate(new Date()), source: "verify-firebase" });
} catch (error) {
  fail(`Escrita recusada: ${error.message}\n\n  Checklist:\n  - O Cloud Firestore está ativado no console?\n  - A conta de serviço é do MESMO projeto (${projectId})?\n  - As regras permitem o Admin SDK (sim, por padrão) e o projeto não está em modo bloqueado para administradores?`);
}
ok("documento gravado");

step("5/5 leitura no Firestore");
try {
  const snapshot = await probe.get();
  if (!snapshot.exists) fail("O documento foi gravado mas não pôde ser lido.");
  await probe.delete();
} catch (error) {
  fail(`Leitura falhou: ${error.message}`);
}
ok("documento lido e removido");

console.log(`\n\x1b[32mFirebase conectado.\x1b[0m Projeto: ${projectId}`);
console.log("Rode `npm run dev` e abra o painel — o modo aparecerá como \"Cloud Firestore\".");
