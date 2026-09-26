# Conectando o GBR Bank ao Firebase (passo a passo)

Este guia leva você do zero até o painel rodando com **Cloud Firestore** — banco de dados na nuvem, acessível de qualquer lugar, no **plano gratuito** do Firebase.

Tempo estimado: **10 a 15 minutos**. Você vai precisar apenas de uma conta Google.

---

## Resumo do que vamos fazer

| Etapa | O que acontece | Onde |
| --- | --- | --- |
| 1 | Criar o projeto no Firebase | console.firebase.google.com |
| 2 | Ativar o Cloud Firestore | console do Firebase |
| 3 | Gerar a chave da conta de serviço | console do Firebase |
| 4 | Colar as credenciais no projeto | `.env.local` (seu computador) |
| 5 | Testar a conexão | `npm run verify:firebase` |
| 6 | Publicar as regras de segurança | console do Firebase |
| 7 | Publicar na Vercel | vercel.com |

> **Importante:** a chave da etapa 3 é um segredo. Ela fica só no `.env.local` e nas variáveis da Vercel — **nunca** no Git, nunca no código do navegador. O `.gitignore` deste repositório já bloqueia `.env.local` e arquivos `*serviceAccount*.json`.

---

## Etapa 1 — Criar o projeto no Firebase

1. Acesse <https://console.firebase.google.com> e faça login com sua conta Google.
2. Clique em **Adicionar projeto** (ou *Create a project*).
3. **Nome do projeto:** `GBR Bank` → *Continuar*.
4. **Google Analytics:** pode **desativar** (o painel não usa) → *Continuar*.
5. Aguarde a criação e clique em *Continuar*.

Você cai no painel do projeto. Anote o **ID do projeto** (aparece no topo, algo como `gbr-bank` ou `gbr-bank-9f3a2`). Ele também está em **⚙ Configurações do projeto → Geral**.

---

## Etapa 2 — Ativar o Cloud Firestore

1. No menu lateral: **Build → Firestore Database**.
2. Clique em **Criar banco de dados** (*Create database*).
3. Se perguntar o modo, escolha **Iniciar no modo de produção** (*production mode*).
   - Não se preocupe: o app usa o Admin SDK no servidor, que não é bloqueado por esse modo. As regras que publicamos na etapa 6 só fecham a porta para o navegador.
4. **Localização:** escolha `southamerica-east1 (São Paulo)` — seus dados ficam no Brasil e as respostas ficam mais rápidas.
   - ⚠️ Essa escolha **não pode ser alterada depois**.
5. Clique em *Criar banco de dados* e aguarde.

Pronto: você já tem um banco de dados remoto. Falta ligar o app nele.

---

## Etapa 3 — Gerar a chave da conta de serviço

É isso que permite ao **servidor** do GBR Bank ler e gravar no Firestore.

1. Clique na **engrenagem ⚙** (canto superior esquerdo) → **Configurações do projeto**.
2. Aba **Contas de serviço** (*Service accounts*).
3. Clique em **Gerar nova chave privada** (*Generate new private key*) → **Gerar chave**.
4. Um arquivo JSON é baixado, algo como `gbr-bank-firebase-adminsdk-xxxxx.json`.
5. **Mova esse arquivo para fora da pasta do projeto** (por exemplo, para a sua área de trabalho) ou renomeie-o — se ficar dentro do repositório com outro nome, ainda assim não suba para o Git.

Abra o arquivo em qualquer editor de texto. Você verá algo assim:

```json
{
  "type": "service_account",
  "project_id": "gbr-bank",
  "private_key_id": "1a2b3c...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADAN...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@gbr-bank.iam.gserviceaccount.com",
  "client_id": "1078...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

Você vai usar três valores: **`project_id`**, **`client_email`** e **`private_key`**.

---

## Etapa 4 — Colar as credenciais no projeto

Na pasta do projeto, copie o modelo e edite:

```bash
cp .env.example .env.local
```

Preencha:

```bash
TZ=America/Sao_Paulo
FIREBASE_PROJECT_ID=gbr-bank
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@gbr-bank.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADAN...\n-----END PRIVATE KEY-----\n"
```

Regras para a `FIREBASE_PRIVATE_KEY`:

- Coloque **entre aspas duplas**;
- Mantenha os `\n` exatamente como estão no JSON (o app converte para quebras de linha reais sozinho);
- Não corte o `-----BEGIN PRIVATE KEY-----` nem o `-----END PRIVATE KEY-----`.

**Alternativa mais simples (recomendada para a Vercel):** em vez de três variáveis, use uma só com o arquivo inteiro:

```bash
# Linux / macOS
base64 -w0 gbr-bank-firebase-adminsdk-xxxxx.json   # copie a saída

# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("gbr-bank-firebase-adminsdk-xxxxx.json"))
```

E no `.env.local` (e depois na Vercel):

```bash
FIREBASE_SERVICE_ACCOUNT_JSON=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50...
```

---

## Etapa 5 — Testar a conexão

```bash
npm install
npm run verify:firebase
```

Saída esperada:

```
1/5 variáveis de ambiente ... ok projeto gbr-bank
2/5 firebase-admin ... ok importado
3/5 autenticação ... ok credenciais aceitas
4/5 escrita no Firestore ... ok documento gravado
5/5 leitura no Firestore ... ok documento lido e removido

Firebase conectado. Projeto: gbr-bank
```

Agora suba o painel:

```bash
npm run dev
```

Abra <http://localhost:3000>. No canto inferior esquerdo da barra lateral deve aparecer **"Firebase conectado"** em verde. Se aparecer **"Modo local"** em amarelo, as variáveis não foram lidas — veja a seção *Problemas comuns* abaixo.

Quer ver tudo funcionando de uma vez? Com o `npm run dev` rodando, em outro terminal:

```bash
node scripts/smoke-test.mjs
```

São 43 verificações (movimentações, transferências, recebíveis, dívidas, metas, exportação e consistência de saldos). Para não deixar dados de teste no seu banco, apague `.data/gbr-bank-local.json` (modo local) ou os documentos da coleção `transactions` no console (modo Firestore).

---

## Etapa 6 — Publicar as regras de segurança

Sem login no painel, a proteção vem daqui: **nenhum navegador consegue tocar no banco diretamente**. Só o servidor do GBR Bank (com a chave da etapa 3) lê e grava.

Pelo console (sem instalar nada):

1. **Build → Firestore Database → aba Regras** (*Rules*).
2. Apague o conteúdo e cole exatamente isto (é o arquivo `firestore/firestore.rules` deste repositório):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

3. Clique em **Publicar** (*Publish*).

Se preferir usar o Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # escolha o seu projeto
firebase deploy --only firestore:rules,firestore:indexes
```

> O app **não precisa de índices compostos**: as consultas filtram por perfil e ordenam no servidor. Isso elimina a classe de erro mais comum do Firestore em produção (`9: FAILED_PRECONDITION`).

---

## Etapa 7 — Publicar na Vercel (acesso de qualquer lugar)

1. Suba este repositório para o GitHub (se ainda não estiver) e acesse <https://vercel.com/new>.
2. Importe o repositório. Framework: **Next.js** (detectado automaticamente).
3. Antes de clicar em *Deploy*, abra **Environment Variables** e adicione:

   | Nome | Valor | Observação |
   | --- | --- | --- |
   | `FIREBASE_PROJECT_ID` | `gbr-bank` | mesmo do `.env.local` |
   | `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-...@....iam.gserviceaccount.com` | secreto |
   | `FIREBASE_PRIVATE_KEY` | `"-----BEGIN PRIVATE KEY-----\n...\n"` | com aspas e `\n` |
   | `TZ` | `America/Sao_Paulo` | opcional (o app já assume esse fuso) |

   Marque as três primeiras como **Sensitive/Secret** se a opção aparecer, e habilite para **Production** e **Preview**.

   > Alternativa: uma única variável `FIREBASE_SERVICE_ACCOUNT_JSON` com o base64 da etapa 4. Na Vercel isso costuma dar menos dor de cabeça com quebras de linha.

4. Clique em **Deploy**. Em ~1 minuto você recebe uma URL `https://gbr-bank-xxxx.vercel.app`.
5. Abra a URL no celular e no computador: os dados são os mesmos, vindos do Firestore.
6. Confirme o status: abra `https://SEU-DOMINIO/api/health`. Esperado:

```json
{ "ok": true, "database": "connected", "mode": "firestore", "projectId": "gbr-bank" }
```

Para validar o deploy inteiro:

```bash
BASE_URL=https://gbr-bank-xxxx.vercel.app node scripts/smoke-test.mjs
```

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| Painel mostra **"Modo local"** | `.env.local` não foi lido | Arquivo na raiz do projeto, nome exato `.env.local`, e reinicie o `npm run dev` |
| `verify:firebase` falha no passo 3 | `private_key` sem aspas ou com quebras de linha reais | Deixe tudo em uma linha, entre aspas duplas, com `\n` |
| `Permission denied` / `7: PERMISSION_DENIED` | Firestore não ativado ou chave de outro projeto | Refaça a etapa 2 e confira o `project_id` |
| `9: FAILED_PRECONDITION ... index` | Consulta exige índice | Não deveria acontecer nesta versão; se aparecer, abra a URL do erro no console e clique em *Criar índice* |
| Na Vercel funciona local mas não no ar | Variáveis não aplicadas ao ambiente | Confira Production/Preview e faça **Redeploy** |
| Datas virando o dia errado | Fuso em UTC | `TZ=America/Sao_Paulo` na Vercel (o app já define por padrão) |
| Erro `Cannot find module 'firebase-admin'` | Dependências não instaladas | `npm install` |

---

## Custos e limites

O **plano Spark (gratuito)** do Firestore inclui, por dia: 50.000 leituras, 20.000 gravações, 1 GiB de armazenamento e 10 GiB de saída de rede. Para um painel financeiro pessoal isso equivale a milhares de lançamentos por dia — na prática, você não vai pagar nada.

Se um dia quiser cartão de crédito no projeto (plano Blaze), o consumo continua pagando por uso e o custo de um uso pessoal fica na casa dos centavos.

## Backup

- **Manual:** no painel, em *Configurações → Dados e backup*, use **Backup JSON** (tudo) ou **Movimentações CSV** (planilha).
- **Automático:** no console do Firestore, *Importar/Exportar* permite snapshots agendados num bucket do Cloud Storage.
- Não versione backups no Git.

## E se eu quiser login depois?

O painel hoje abre direto no dashboard, como você pediu. Como só o servidor fala com o banco, os dados não ficam expostos — mas **quem tiver a URL vê o painel**. Quando quiser proteger:

1. Ative **Authentication → Sign-in method → E-mail/senha** no Firebase e crie o seu usuário.
2. Adicione o SDK `firebase` no cliente e uma tela de login.
3. Troque `profileId` fixo (`default`) pelo `uid` do usuário autenticado.
4. Ajuste as regras para `allow read, write: if request.auth != null`.

A estrutura já está pronta para isso: todas as coleções têm `profileId`.
