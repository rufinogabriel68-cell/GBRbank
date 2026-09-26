# GBR Bank

Painel financeiro pessoal privado para uso diário. O GBR Bank **não é um banco**: não realiza transações bancárias reais e não possui integração bancária/Open Finance.

Os dados ficam no **Cloud Firestore (Firebase)** — um banco na nuvem, gratuito e acessível de qualquer lugar. Sem credenciais configuradas, o app roda num banco local em arquivo para você desenvolver e testar.

## Stack

- Next.js 16 + App Router + React 19 + TypeScript
- Tailwind CSS 4
- **Firebase Admin SDK + Cloud Firestore** (banco de dados)
- Recharts e Lucide React
- Vercel (hospedagem)

Nenhum saldo depende de `localStorage`: tudo é persistido no banco. Valores monetários são tratados em **centavos (inteiros)** e gravados como string com 2 casas — nunca `float`.

## Começar em 60 segundos (sem Firebase)

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>. O painel cria automaticamente perfil, 3 contas e 17 categorias, tudo em R$ 0,00. Os dados ficam em `.data/gbr-bank-local.json` (pasta ignorada pelo Git).

A barra lateral mostra o banco em uso: **"Modo local"** (amarelo) ou **"Firebase conectado"** (verde).

## Conectar ao Firebase (acesso remoto)

Passo a passo completo com cliques e capturas de onde encontrar cada valor:

👉 **[docs/FIREBASE-SETUP.md](docs/FIREBASE-SETUP.md)**

Resumo:

```bash
cp .env.example .env.local     # preencha FIREBASE_PROJECT_ID, CLIENT_EMAIL e PRIVATE_KEY
npm run verify:firebase        # testa credenciais + leitura/escrita no Firestore
npm run dev                    # a barra lateral passa a mostrar "Firebase conectado"
```

## Variáveis de ambiente

| Variável | Onde vive | Obrigatória |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | servidor | para usar o Firestore |
| `FIREBASE_CLIENT_EMAIL` | servidor (secreta) | para usar o Firestore |
| `FIREBASE_PRIVATE_KEY` | servidor (secreta) | para usar o Firestore |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | servidor (secreta) | alternativa: o JSON inteiro (ou base64) |
| `TZ` | servidor | opcional — o app já assume `America/Sao_Paulo` |
| `APP_ADMIN_EMAIL` | servidor | opcional — e-mail do perfil inicial |
| `LOCAL_DB_PATH` | servidor | opcional — caminho do banco local |

Nenhuma variável é exposta ao navegador: o Firestore é acessado **somente** pelas rotas de API, no servidor. Não existe `NEXT_PUBLIC_*` com segredo neste projeto.

## Scripts

```bash
npm run dev                 # desenvolvimento
npm run build               # build de produção
npm run start               # servir o build
npm run typecheck           # checagem de tipos
npm run lint                # eslint
npm run verify:firebase     # testa a conexão real com o Firestore
node scripts/smoke-test.mjs # 43 verificações de ponta a ponta nas APIs
BASE_URL=https://SEU-APP.vercel.app node scripts/smoke-test.mjs   # testa o deploy
```

## Deploy na Vercel

1. Importe o repositório em <https://vercel.com/new> (framework Next.js detectado).
2. Adicione as variáveis do Firebase em **Settings → Environment Variables** (Production e Preview).
   - Dica: na Vercel, `FIREBASE_SERVICE_ACCOUNT_JSON` em base64 evita problemas com quebras de linha da chave privada.
3. Deploy. Confira `https://SEU-APP.vercel.app/api/health` — deve retornar `"mode": "firestore"`.

## Como os dados estão organizados

Coleções do Firestore (todas com `profileId`):

`profiles`, `accounts`, `categories`, `transactions`, `transfers`, `receivables`, `receivable_payments`, `debts`, `debt_payments`, `bills`, `goals`, `personal_settlement`, `settings`, `audit_logs`.

Regras de negócio mantidas da versão anterior:

- transferências gravam origem/destino, atualizam as duas contas na mesma transação e ficam fora de receitas/despesas;
- pagamentos de recebíveis e dívidas gravam pagamento + movimentação + ajuste de saldo atomicamente;
- saldo insuficiente e pagamento acima do valor restante são bloqueados;
- exclusão/edição de movimentação devolve ou ajusta o saldo da conta.

Decisões de banco:

- **Transações nativas do Firestore** (`runTransaction`) em tudo que mexe em saldo;
- filtros de igualdade vão ao Firestore; **ordenação e limite são feitos no servidor**, o que dispensa índices compostos;
- dinheiro como string de 2 casas, aritmética em centavos.

## Arquitetura

```
src/db/schema.ts           coleções, campos, padrões e tipos
src/db/types.ts            contrato único de acesso a dados
src/db/drivers/firestore.ts  driver Cloud Firestore (produção / remoto)
src/db/drivers/local.ts      driver em arquivo (desenvolvimento sem Firebase)
src/db/index.ts            escolhe o driver conforme as variáveis
src/lib/server.ts          perfil, validações, dinheiro em centavos, datas
src/app/api/**             20 rotas de API (única porta de entrada dos dados)
src/instrumentation.ts     define o fuso horário no servidor
firestore/firestore.rules  regras de segurança (porta fechada para o navegador)
```

Trocar de banco não exige tocar nas rotas: elas usam só a interface de `src/db/types.ts`.

## Segurança

O painel abre direto no dashboard (uso pessoal, sem tela de login). A proteção vem de duas camadas:

1. **Regras do Firestore em `allow read, write: if false`** — nenhum cliente acessa o banco diretamente; só o servidor com a chave de conta de serviço.
2. Toda validação acontece nas rotas de API.

Consequência prática: **quem tiver a URL vê o painel**. Se for publicar abertamente, considere adicionar login (roteiro em [docs/FIREBASE-SETUP.md](docs/FIREBASE-SETUP.md#e-se-eu-quiser-login-depois)).

## Backup

- **Backup JSON** e **Movimentações CSV** em *Configurações → Dados e backup* (ou `/api/export?format=json|csv`).
- Snapshots automáticos pelo console do Firestore (Importar/Exportar).
- Não versione backups nem chaves no Git.

## Validação

```bash
npm run typecheck
npm run build
npm run verify:firebase
node scripts/smoke-test.mjs
```
