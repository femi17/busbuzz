-- ============================================================
-- BusBuzz auth -> profiles sync
-- Automatically creates a public.profiles row whenever a new
-- auth.users row is inserted (e.g. via Supabase Auth signup).
-- ============================================================

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email, ''),
    'PARENT'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_auth_user();
