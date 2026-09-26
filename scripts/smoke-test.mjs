#!/usr/bin/env node
/**
 * Teste de ponta a ponta das APIs do GBR Bank.
 *
 *   npm run dev            # em outro terminal
 *   node scripts/smoke-test.mjs
 *   BASE_URL=https://gbrbank.vercel.app node scripts/smoke-test.mjs
 *
 * Exercita todo o fluxo financeiro (contas, movimentações, transferência,
 * recebíveis, dívidas, contas a pagar, metas, acerto, perfil, busca,
 * exportação e auditoria) e confere os saldos em centavos.
 */

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

let passed = 0;
const failures = [];

const money = (value) => Math.round(Number(String(value).replace(",", ".")) * 100);
const brl = (cents) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

async function call(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}: ${payload.error || text.slice(0, 200)}`);
  return payload;
}

function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failures.push(label);
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

async function main() {
  console.log(`\nGBR Bank · smoke test em ${BASE_URL}\n${"─".repeat(56)}`);

  section("1. Saúde e configuração");
  const health = await call("/api/health");
  check("banco conectado", health.ok === true && health.database === "connected", JSON.stringify(health));
  check("modo do banco informado", ["firestore", "local"].includes(health.mode), health.mode);
  console.log(`     → ${health.label}${health.projectId ? ` (${health.projectId})` : ""}`);

  const setup = await call("/api/setup", { method: "POST" });
  check("setup idempotente", setup.ok === true && Boolean(setup.profileId));

  section("2. Base inicial");
  let dashboard = await call("/api/dashboard");
  check("perfil criado", dashboard.profile?.name === "Gabriel", JSON.stringify(dashboard.profile));
  check("3 contas padrão", dashboard.accounts.length === 3, `${dashboard.accounts.length}`);
  check("17 categorias padrão", dashboard.categories.length === 17, `${dashboard.categories.length}`);
  check("configurações presentes", Boolean(dashboard.settings));
  check("meu acerto presente", Boolean(dashboard.settlement));

  const byName = new Map(dashboard.accounts.map((row) => [row.name, row]));
  const carteira = byName.get("Carteira");
  const banco = byName.get("Banco");
  const reserva = byName.get("Reserva");
  check("contas padrão nomeadas", Boolean(carteira && banco && reserva), [...byName.keys()].join(", "));

  section("3. Saldo inicial");
  await call(`/api/accounts/${banco.id}`, { method: "PATCH", body: JSON.stringify({ balance: "1000" }) });
  dashboard = await call("/api/dashboard");
  const saldoInicial = money(dashboard.accounts.find((row) => row.id === banco.id).balance);
  check("saldo definido em R$ 1000,00", saldoInicial === 100000, brl(saldoInicial));

  section("4. Movimentações");
  const income = await call("/api/transactions", {
    method: "POST",
    body: JSON.stringify({ type: "income", accountId: banco.id, amount: "250,50", description: "Serviço cliente A", categoryName: "Serviços", origin: "gbr" }),
  });
  check("entrada criada", income.id && money(income.amount) === 25050, JSON.stringify(income.amount));
  check("aceita valor com vírgula", money(income.amount) === 25050);

  const expense = await call("/api/transactions", {
    method: "POST",
    body: JSON.stringify({ type: "expense", accountId: banco.id, amount: "100.25", description: "Combustível", categoryName: "Combustível", origin: "personal" }),
  });
  check("saída criada", expense.id && money(expense.amount) === 10025);

  dashboard = await call("/api/dashboard");
  const balanceAfter = money(dashboard.accounts.find((row) => row.id === banco.id).balance);
  check(`saldo = 1000 + 250,50 − 100,25 = ${brl(115025)}`, balanceAfter === 115025, brl(balanceAfter));

  section("5. Transferência entre contas");
  const transfer = await call("/api/transactions", {
    method: "POST",
    body: JSON.stringify({ type: "transfer", fromAccountId: banco.id, toAccountId: reserva.id, amount: "150", description: "Aporte na reserva" }),
  });
  check("transferência criada", Boolean(transfer.id));
  dashboard = await call("/api/dashboard");
  const bancoRow = dashboard.accounts.find((row) => row.id === banco.id);
  const reservaRow = dashboard.accounts.find((row) => row.id === reserva.id);
  check(`origem ficou com ${brl(100025)}`, money(bancoRow.balance) === 100025, brl(money(bancoRow.balance)));
  check(`destino ficou com ${brl(15000)}`, money(reservaRow.balance) === 15000, brl(money(reservaRow.balance)));
  check("transferência não entra em receitas/despesas", dashboard.month.income === 250.5 && dashboard.month.expense === 100.25, JSON.stringify(dashboard.month));

  section("6. Transferência inválida é bloqueada");
  try {
    await call("/api/transactions", { method: "POST", body: JSON.stringify({ type: "transfer", fromAccountId: carteira.id, toAccountId: reserva.id, amount: "9999" }) });
    check("saldo insuficiente rejeitado", false, "a API aceitou a transferência");
  } catch (error) {
    check("saldo insuficiente rejeitado", /insuficiente/i.test(error.message), error.message);
  }

  section("7. A receber");
  const receivable = await call("/api/receivables", {
    method: "POST",
    body: JSON.stringify({ person: "João", description: "Freela site", originalAmount: "800", dueDate: new Date().toISOString().slice(0, 10) }),
  });
  check("recebível criado", receivable.id && money(receivable.originalAmount) === 80000);
  await call(`/api/receivables/${receivable.id}/pay`, { method: "POST", body: JSON.stringify({ amount: "300", accountId: banco.id }) });
  let list = await call("/api/receivables");
  let row = list.find((item) => item.id === receivable.id);
  check("pagamento parcial registrado", money(row.receivedAmount) === 30000 && money(row.remainingAmount) === 50000, JSON.stringify({ r: row.receivedAmount, s: row.remainingAmount }));
  await call(`/api/receivables/${receivable.id}/pay`, { method: "POST", body: JSON.stringify({ amount: "500", accountId: banco.id }) });
  list = await call("/api/receivables");
  row = list.find((item) => item.id === receivable.id);
  check("quitado vira received", row.status === "received", row.status);
  try {
    await call(`/api/receivables/${receivable.id}/pay`, { method: "POST", body: JSON.stringify({ amount: "10", accountId: banco.id }) });
    check("pagamento acima do restante bloqueado", false);
  } catch (error) {
    check("pagamento acima do restante bloqueado", /restante/i.test(error.message), error.message);
  }

  section("8. Dívidas");
  const debt = await call("/api/debts", {
    method: "POST",
    body: JSON.stringify({ name: "Cartão", creditor: "Banco X", originalAmount: "450", installments: 3, nextDueDate: new Date().toISOString().slice(0, 10) }),
  });
  check("dívida criada", debt.id && money(debt.originalAmount) === 45000);
  dashboard = await call("/api/dashboard");
  const balanceBeforePay = money(dashboard.accounts.find((item) => item.id === banco.id).balance);
  await call(`/api/debts/${debt.id}/pay`, { method: "POST", body: JSON.stringify({ amount: "450", accountId: banco.id }) });
  list = await call("/api/debts");
  row = list.find((item) => item.id === debt.id);
  check("dívida quitada", row.status === "paid" && money(row.remainingAmount) === 0, row.status);
  dashboard = await call("/api/dashboard");
  check("saldo debitado no pagamento", money(dashboard.accounts.find((item) => item.id === banco.id).balance) === balanceBeforePay - 45000);

  section("9. Contas a pagar");
  const bill = await call("/api/bills", {
    method: "POST",
    body: JSON.stringify({ name: "Internet", amount: "99,90", dueDate: new Date().toISOString().slice(0, 10), recurrence: "monthly", category: "Casa" }),
  });
  check("conta criada", bill.id && money(bill.amount) === 9990);
  const paidBill = await call(`/api/bills/${bill.id}`, { method: "PATCH", body: JSON.stringify({ status: "paid" }) });
  check("conta marcada como paga", paidBill.status === "paid");

  section("10. Metas e acerto");
  const goal = await call("/api/goals", { method: "POST", body: JSON.stringify({ name: "Reserva de emergência", targetAmount: "5000", currentAmount: "1200" }) });
  check("meta criada", goal.id && money(goal.targetAmount) === 500000);
  list = await call("/api/goals");
  row = list.find((item) => item.id === goal.id);
  check("progresso calculado", row.progress === 24 && money(row.remainingAmount) === 380000, JSON.stringify({ p: row.progress, r: row.remainingAmount }));
  const settlement = await call("/api/settlement", { method: "PATCH", body: JSON.stringify({ targetAmount: "2000", savedAmount: "750,25" }) });
  check("acerto atualizado", money(settlement.savedAmount) === 75025 && money(settlement.remainingAmount ?? 0) >= 0, JSON.stringify(settlement.savedAmount));

  section("11. Perfil, categorias e busca");
  const profile = await call("/api/profile", { method: "PATCH", body: JSON.stringify({ name: "Gabriel Rufino", theme: "dark" }) });
  check("perfil atualizado", profile.name === "Gabriel Rufino", profile.name);
  const category = await call("/api/categories", { method: "POST", body: JSON.stringify({ name: "Ferramentas novas", kind: "expense" }) });
  check("categoria criada", category.id && category.kind === "expense");
  const search = await call("/api/search?q=combust");
  check("busca encontra movimentação", search.transactions.some((item) => /combust/i.test(item.description || "")), JSON.stringify(search.transactions.length));

  section("12. Exportação");
  const backup = await call("/api/export?format=json");
  check("backup JSON completo", Array.isArray(backup.transactions) && backup.transactions.length >= 5 && Array.isArray(backup.accounts));
  const csv = await fetch(`${BASE_URL}/api/export?format=csv`);
  const csvText = await csv.text();
  check("CSV gerado", csv.ok && csvText.split("\n").length >= 6 && /data;tipo;valor/.test(csvText), csvText.slice(0, 60));

  section("13. Edição e exclusão mantêm o saldo");
  const edited = await call(`/api/transactions/${expense.id}`, { method: "PATCH", body: JSON.stringify({ amount: "200.25", description: "Combustível (ajustado)" }) });
  check("valor editado", money(edited.amount) === 20025, JSON.stringify(edited.amount));
  dashboard = await call("/api/dashboard");
  const afterEdit = money(dashboard.accounts.find((item) => item.id === banco.id).balance);
  check(`saldo ajustado em ${brl(afterEdit)}`, afterEdit === balanceBeforePay - 45000 - 10000, brl(afterEdit));
  await call(`/api/transactions/${edited.id}`, { method: "DELETE" });
  dashboard = await call("/api/dashboard");
  const afterDelete = money(dashboard.accounts.find((item) => item.id === banco.id).balance);
  check("exclusão devolve o valor ao saldo", afterDelete === afterEdit + 20025, `${brl(afterDelete)} vs ${brl(afterEdit + 20025)}`);

  section("14. Consistência do painel");
  dashboard = await call("/api/dashboard");
  const somaContas = dashboard.accounts.filter((item) => item.status === "active").reduce((total, item) => total + money(item.balance), 0);
  check("saldo disponível = soma das contas", money(dashboard.totals.available) === somaContas, `${brl(money(dashboard.totals.available))} vs ${brl(somaContas)}`);
  check("patrimônio = disponível + a receber − dívidas", money(dashboard.totals.netWorth) === money(dashboard.totals.available) + money(dashboard.totals.toReceive) - money(dashboard.totals.debtTotal));
  check("gráfico de 7 dias", dashboard.chart.length === 7);
  check("sem valores NaN", !JSON.stringify(dashboard.totals).includes("NaN"));

  console.log(`\n${"─".repeat(56)}`);
  if (failures.length) {
    console.log(`\x1b[31m${failures.length} falha(s)\x1b[0m e ${passed} verificações ok:`);
    failures.forEach((item) => console.log(`  • ${item}`));
    process.exit(1);
  }
  console.log(`\x1b[32mTudo certo: ${passed} verificações passaram.\x1b[0m`);
  console.log(`Banco em uso: ${health.label}${health.projectId ? ` · projeto ${health.projectId}` : ""}\n`);
}

main().catch((error) => {
  console.error(`\n\x1b[31mErro no smoke test:\x1b[0m ${error.message}`);
  console.error("O servidor está rodando? Use `npm run dev` ou informe BASE_URL.");
  process.exit(1);
});
