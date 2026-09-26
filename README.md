# GBR Bank

Painel financeiro pessoal privado para uso diário. O GBR Bank **não é um banco**, não realiza transações bancárias reais e não possui integração bancária/Open Finance.

## Stack

- Next.js 16 + App Router + React + TypeScript
- Tailwind CSS 4
- PostgreSQL com Drizzle ORM
- Supabase PostgreSQL, Auth, RLS e Storage-ready
- Recharts e Lucide React
- Vercel

Os dados financeiros são persistidos no PostgreSQL. O navegador guarda apenas preferências de interface; nenhum saldo ou movimentação depende de `localStorage`.

## 1. Criar o projeto no Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em **Project Settings → Database**, copie a connection string no modo URI e use-a como `DATABASE_URL`.
3. Em **SQL Editor**, execute `supabase/migrations/0001_gbr_bank.sql`.
4. Em **Authentication → Providers → Email**, mantenha Email habilitado.
5. Crie o administrador inicial pelo Auth com:
   - e-mail interno: `admin@gbrbank.local`
   - senha inicial: `admin`
6. Execute `supabase/seed.sql` no SQL Editor. O seed cria apenas perfil, categorias e configurações; não cria dados financeiros fictícios.

Também é possível chamar `POST /api/setup` em um ambiente de servidor com `SUPABASE_SERVICE_ROLE_KEY` configurada. A service role é lida somente no servidor e nunca é importada por componentes client.

## 2. Variáveis de ambiente

Copie `.env.example` para `.env.local`:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
SUPABASE_ADMIN_EMAIL=admin@gbrbank.local
```

- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` podem ser expostas ao navegador.
- `SUPABASE_SERVICE_ROLE_KEY` nunca deve ser prefixada com `NEXT_PUBLIC_` nem adicionada ao frontend.
- Para o sandbox local, `DATABASE_URL` pode apontar para o PostgreSQL local.

## 3. Executar localmente

```bash
npm install
npx drizzle-kit push
npm run dev
```

Acesse `http://localhost:3000`. A primeira chamada cria o perfil `admin`, as categorias padrão e as configurações vazias. O painel inicia com R$ 0,00 em todas as métricas.

Para aplicar a migration Supabase, use o Supabase CLI:

```bash
supabase db push
# ou use o SQL Editor com o arquivo da migration
```

## 4. Acesso inicial e segurança

A interface abre diretamente no dashboard como solicitado para um ambiente pessoal de usuário único. A infraestrutura de autenticação usa Supabase Auth e o perfil é ligado ao `auth.users.id` na migration. A senha `admin` não é armazenada no PostgreSQL da aplicação.

Depois do primeiro acesso, a troca de senha deve ser realizada no Supabase Auth (ou pelo fluxo de Auth que você adicionar ao projeto). A tela Configurações permite atualizar nome, e-mail e usuário do perfil. Para um deploy exposto à internet, habilite uma tela de login/middleware com o cliente SSR já preparado em `src/lib/supabase/server.ts`.

## 5. Deploy na Vercel

1. Envie o repositório para GitHub/GitLab.
2. Importe o projeto na Vercel.
3. Adicione as mesmas variáveis em **Settings → Environment Variables** para Preview e Production.
4. Use o comando padrão `npm run build`.
5. Rode a migration/seed uma vez no projeto Supabase.
6. Faça o deploy. O endpoint `/api/health` valida a conexão PostgreSQL.

`vercel.json` já declara o framework Next.js e os comandos de instalação/build.

## 6. Banco e consistência

As tabelas principais são `profiles`, `accounts`, `categories`, `transactions`, `transfers`, `receivables`, `receivable_payments`, `debts`, `debt_payments`, `bills`, `goals`, `personal_settlement`, `settings` e `audit_logs`.

- Valores usam `numeric(14,2)`, nunca `float`.
- Transferências gravam origem/destino, atualizam as duas contas em transação e ficam fora de receitas/despesas.
- Pagamentos de recebíveis e dívidas gravam pagamento, movimentação e ajuste de saldo no mesmo bloco transacional.
- RLS usa `profile_id = auth.uid()` para impedir acesso cruzado entre futuros usuários.
- Índices foram criados para perfil, status, datas, conta e categoria.

## 7. Backup e exportação

Na tela **Relatórios** ou **Configurações**, use:

- `/api/export?format=json` para backup completo legível;
- `/api/export?format=csv` para movimentações em planilha.

Para backup completo de produção, combine a exportação JSON com os backups automáticos do Supabase. Não coloque os arquivos exportados no Git.

## 8. Validação

```bash
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
```

O projeto foi organizado para aceitar categorias, contas e usuários adicionais no futuro sem transformar o painel em um ERP.
