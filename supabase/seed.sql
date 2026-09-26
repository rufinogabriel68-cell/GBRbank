-- Run after creating the initial Auth user through Supabase Auth or /api/setup.
-- No balances, debts, receivables or transactions are seeded.
insert into public.profiles (id, username, name, email)
select id, 'admin', 'Gabriel', coalesce(email, 'admin@gbrbank.local') from auth.users order by created_at asc limit 1
on conflict (id) do nothing;

insert into public.categories (profile_id, name, kind, color, is_default)
select p.id, item.name, item.kind::category_kind, item.color, true
from public.profiles p
cross join (values
  ('Serviços','income','#42d6b7'), ('Clientes','income','#42d6b7'), ('Salário','income','#42d6b7'), ('Vendas','income','#42d6b7'), ('Comissão','income','#42d6b7'), ('Outros','income','#42d6b7'),
  ('Alimentação','expense','#ff826e'), ('Combustível','expense','#ff826e'), ('Faculdade','expense','#ff826e'), ('Carro','expense','#ff826e'), ('Ferramentas','expense','#ff826e'), ('Materiais','expense','#ff826e'), ('Casa','expense','#ff826e'), ('Lazer','expense','#ff826e'), ('Assinaturas','expense','#ff826e'), ('Dívidas','expense','#ff826e'), ('Outros','expense','#ff826e')
) as item(name, kind, color)
where not exists (select 1 from public.categories c where c.profile_id = p.id and c.name = item.name and c.kind = item.kind::category_kind);

insert into public.accounts (profile_id, name, type, balance, description)
select id, item.name, item.type::account_type, 0, item.description
from public.profiles
cross join (values ('Carteira','physical','Dinheiro físico'), ('Banco','digital','Conta digital'), ('Reserva','investment','Poupança e investimentos')) as item(name, type, description)
where not exists (select 1 from public.accounts a where a.profile_id = profiles.id and a.name = item.name);

insert into public.settings (profile_id) select id from public.profiles on conflict (profile_id) do nothing;
insert into public.personal_settlement (profile_id) select id from public.profiles on conflict (profile_id) do nothing;
