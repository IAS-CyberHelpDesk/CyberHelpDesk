
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true);
$$;


create or replace function public.protect_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if new.role is distinct from old.role and not public.is_admin() then
      new.role := old.role;
    end if;
    if new.is_super_admin is distinct from old.is_super_admin and not public.is_super_admin() then
      new.is_super_admin := old.is_super_admin;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();

update public.profiles
   set role = 'admin',
       is_super_admin = true,
       admin_title = 'Super Admin'
 where email = 'jaysonvilla774@gmail.com';


update public.profiles
   set role = 'admin',
       is_super_admin = false,
       admin_title = 'Senior Support Admin'
 where email = 'renrenregidor@gmail.com';


select email, role, is_super_admin, admin_title
  from public.profiles
 where role = 'admin'
 order by is_super_admin desc, email;
