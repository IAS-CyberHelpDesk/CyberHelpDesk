create extension if not exists pgcrypto;

-- ---------- Profiles (one row per auth user) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user','admin')),
  full_name text not null default '',
  business_name text,
  email text,
  phone text,
  admin_title text,
  avatar_url text,
  notify_ticket_status boolean not null default true,
  notify_verdicts boolean not null default true,
  sms_high_priority boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, business_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', ''),
          new.raw_user_meta_data->>'business_name');
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Users can never promote themselves. (SQL editor / service role has auth.uid() = null and may.)
create or replace function public.protect_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();

create or replace function public.pname(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(full_name,''), email, 'Someone') from public.profiles where id = uid;
$$;

-- ---------- Helpdesk configuration (single row) ----------
create table if not exists public.admin_settings (
  id int primary key default 1 check (id = 1),
  auto_assign boolean not null default true,
  auto_prioritize boolean not null default true,
  priority_keywords text[] not null default '{urgent,hacked,"locked out"}',
  sla_alerts boolean not null default false
);
insert into public.admin_settings (id) values (1) on conflict do nothing;

-- ---------- Tickets (incident reports) ----------
create sequence if not exists public.ticket_seq start 1001;
create sequence if not exists public.txn_seq start 501;

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('Phishing','Malware','Suspicious Link','Unauthorized Access','Compromised Account','Other')),
  subject text not null,
  description text,
  occurred_at timestamptz,
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  status text not null default 'new' check (status in ('draft','new','in_progress','resolved')),
  assigned_to uuid references public.profiles(id) on delete set null,
  sender_domain text,
  category text,
  affected_users int,
  source text not null default 'Web Form',
  escalated boolean not null default false,
  due_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tickets_reporter_idx on public.tickets(reporter_id);
create index if not exists tickets_assignee_idx on public.tickets(assigned_to);

-- ---------- Transaction verification requests ----------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  submitter_id uuid not null references public.profiles(id) on delete cascade,
  recipient_name text not null,
  channel text not null,
  account_number text not null,
  amount numeric(14,2) not null check (amount > 0),
  request_source text,
  notes text,
  status text not null default 'submitted' check (status in ('submitted','under_review','verdict_issued')),
  verdict text check (verdict in ('safe','suspicious','needs_info')),
  verdict_justification text,
  verdict_by uuid references public.profiles(id) on delete set null,
  verdict_at timestamptz,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  risk_score int,
  risk_flags text[] not null default '{}',
  assigned_to uuid references public.profiles(id) on delete set null,
  checklist jsonb not null default '{}'::jsonb,
  cosign_requested boolean not null default false,
  second_approver uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists txn_submitter_idx on public.transactions(submitter_id);

create table if not exists public.checklist_items (
  key text primary key,
  group_name text not null,
  label text not null,
  required boolean not null default false,
  sort int not null default 0
);
insert into public.checklist_items (key, group_name, label, required, sort) values
 ('name_matches',      'Identity & account', 'Recipient name matches known contact', true, 1),
 ('submitter_known',   'Identity & account', 'Submitter identity & device recognized', false, 2),
 ('callback_confirmed','Identity & account', 'Callback to a known number confirmed (out-of-band)', true, 3),
 ('account_matches',   'Payment details',    'Account number matches prior transactions', true, 4),
 ('amount_in_range',   'Payment details',    'Amount within the sender''s normal range', false, 5),
 ('no_duplicate',      'Payment details',    'No duplicate or rapid repeat transaction', false, 6),
 ('bank_age_confirmed','Payment details',    'Recipient bank & account age confirmed', false, 7),
 ('domain_matches',    'Fraud signals',      'Sender domain matches official domain', true, 8),
 ('spf_dkim',          'Fraud signals',      'Email passes SPF / DKIM / DMARC', false, 9),
 ('no_scam_pattern',   'Fraud signals',      'No known scam pattern detected', true, 10),
 ('not_blocklisted',   'Fraud signals',      'Recipient not on blocklist / fraud database', false, 11),
 ('attachments_clean', 'Fraud signals',      'Attachments scanned for malware', false, 12)
on conflict (key) do update set group_name = excluded.group_name, label = excluded.label,
  required = excluded.required, sort = excluded.sort;

-- ---------- Conversation, activity, files, feedback ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  check ((ticket_id is null) <> (transaction_id is null))
);
create index if not exists messages_ticket_idx on public.messages(ticket_id, created_at);
create index if not exists messages_txn_idx on public.messages(transaction_id, created_at);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null,
  message text not null,
  created_at timestamptz not null default now(),
  check ((ticket_id is null) <> (transaction_id is null))
);
create index if not exists events_ticket_idx on public.events(ticket_id, created_at);
create index if not exists events_txn_idx on public.events(transaction_id, created_at);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  size_bytes bigint,
  mime_type text,
  created_at timestamptz not null default now(),
  check ((ticket_id is null) <> (transaction_id is null))
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  check ((ticket_id is null) <> (transaction_id is null))
);
create unique index if not exists feedback_one_per_ticket on public.feedback(ticket_id, user_id) where ticket_id is not null;
create unique index if not exists feedback_one_per_txn on public.feedback(transaction_id, user_id) where transaction_id is not null;

-- =====================================================================
-- Business logic (triggers)
-- =====================================================================
create or replace function public.dual_approval_threshold() returns numeric
language sql immutable as $$ select 50000::numeric $$;

create or replace function public.pick_admin() returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p where p.role = 'admin'
  order by (select count(*) from public.tickets t where t.assigned_to = p.id and t.status in ('new','in_progress'))
         + (select count(*) from public.transactions x where x.assigned_to = p.id and x.verdict is null),
           p.created_at
  limit 1;
$$;

-- Tickets: code, priority, SLA due date, auto-assignment
create or replace function public.tickets_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.admin_settings; kw text; submitting boolean;
begin
  if tg_op = 'INSERT' then
    if new.code is null then new.code := 'TCK-' || nextval('public.ticket_seq'); end if;
    submitting := new.status = 'new';
  else
    submitting := old.status = 'draft' and new.status = 'new';
    new.updated_at := now();
    if new.status = 'resolved' and old.status <> 'resolved' then new.resolved_at := now(); end if;
    if new.status <> 'resolved' then new.resolved_at := null; end if;
  end if;

  if submitting then
    select * into s from public.admin_settings where id = 1;
    if not public.is_admin() then
      new.assigned_to := null; new.first_response_at := null; new.escalated := false;
    end if;
    new.priority := new.severity;
    if s.auto_prioritize then
      foreach kw in array s.priority_keywords loop
        if position(lower(kw) in lower(coalesce(new.subject,'') || ' ' || coalesce(new.description,''))) > 0 then
          new.priority := 'high';
        end if;
      end loop;
    end if;
    new.created_at := now();
    new.due_at := now() + case new.priority when 'high' then interval '8 hours'
                                           when 'medium' then interval '24 hours'
                                           else interval '72 hours' end;
    if s.auto_assign and new.assigned_to is null then new.assigned_to := public.pick_admin(); end if;
  end if;
  return new;
end $$;
drop trigger if exists tickets_before_trg on public.tickets;
create trigger tickets_before_trg before insert or update on public.tickets
  for each row execute function public.tickets_before();

create or replace function public.tickets_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.status = 'new') or (tg_op = 'UPDATE' and old.status = 'draft' and new.status = 'new') then
    insert into public.events (ticket_id, actor_id, kind, message)
      values (new.id, new.reporter_id, 'submitted', 'Submitted the ticket');
    if new.assigned_to is not null then
      insert into public.events (ticket_id, kind, message)
        values (new.id, 'assigned', 'Ticket auto-assigned to ' || public.pname(new.assigned_to));
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.events (ticket_id, actor_id, kind, message)
        values (new.id, auth.uid(), 'status', 'Status changed to ' || initcap(replace(new.status, '_', ' ')));
    end if;
    if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
      insert into public.events (ticket_id, actor_id, kind, message)
        values (new.id, auth.uid(), 'assigned', 'Assigned to ' || public.pname(new.assigned_to));
    end if;
    if new.priority is distinct from old.priority then
      insert into public.events (ticket_id, actor_id, kind, message)
        values (new.id, auth.uid(), 'priority', 'Priority changed to ' || initcap(new.priority));
    end if;
    if new.escalated and not old.escalated then
      insert into public.events (ticket_id, actor_id, kind, message)
        values (new.id, auth.uid(), 'escalated', 'Escalated to Security Lead');
    end if;
  end if;
  return null;
end $$;
drop trigger if exists tickets_after_trg on public.tickets;
create trigger tickets_after_trg after insert or update on public.tickets
  for each row execute function public.tickets_after();

-- Transactions: code, heuristic risk score, SLA, auto-assignment
create or replace function public.transactions_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.admin_settings; prior int; avg_amt numeric; score int := 10; flags text[] := '{}';
begin
  if tg_op = 'INSERT' then
    new.code := coalesce(new.code, 'TXN-' || lpad(nextval('public.txn_seq')::text, 4, '0'));
    if not public.is_admin() then
      new.status := 'submitted'; new.verdict := null; new.verdict_justification := null;
      new.verdict_by := null; new.verdict_at := null; new.assigned_to := null;
      new.checklist := '{}'::jsonb; new.second_approver := null; new.cosign_requested := false;
    end if;
    select count(*) into prior from public.transactions
      where submitter_id = new.submitter_id and account_number = new.account_number;
    select avg(amount) into avg_amt from public.transactions where submitter_id = new.submitter_id;

    if prior = 0 then score := score + 30; flags := flags || 'New payee — never paid before'; end if;
    if avg_amt is not null and new.amount > avg_amt * 3 then
      score := score + 25;
      flags := flags || ('Amount is ' || round(new.amount / avg_amt, 1) || '× this business''s average request');
    end if;
    if new.amount >= public.dual_approval_threshold() then
      score := score + 20; flags := flags || 'Amount exceeds the dual-approval threshold';
    end if;
    if lower(coalesce(new.request_source,'')) ~ '(sms|messenger|phone|call|whatsapp|viber|telegram)' then
      score := score + 10; flags := flags || 'Request arrived through an informal channel';
    end if;
    new.risk_score := least(score, 100);
    new.risk_flags := flags;
    new.priority := case when new.risk_score >= 70 or new.amount >= public.dual_approval_threshold() then 'high'
                         when new.risk_score >= 40 then 'medium' else 'low' end;
    new.due_at := now() + interval '4 hours';
    select * into s from public.admin_settings where id = 1;
    if s.auto_assign and new.assigned_to is null then new.assigned_to := public.pick_admin(); end if;
  else
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists transactions_before_trg on public.transactions;
create trigger transactions_before_trg before insert or update on public.transactions
  for each row execute function public.transactions_before();

create or replace function public.transactions_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.events (transaction_id, actor_id, kind, message)
      values (new.id, new.submitter_id, 'submitted', 'Submitted transaction for verification');
    if new.assigned_to is not null then
      insert into public.events (transaction_id, kind, message)
        values (new.id, 'assigned', 'Request auto-assigned to ' || public.pname(new.assigned_to));
    end if;
  else
    if new.status is distinct from old.status and new.status = 'under_review' then
      insert into public.events (transaction_id, actor_id, kind, message)
        values (new.id, auth.uid(), 'status', 'Marked as Under Review and began cross-checking recipient details');
    end if;
    if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
      insert into public.events (transaction_id, actor_id, kind, message)
        values (new.id, auth.uid(), 'assigned', 'Assigned to ' || public.pname(new.assigned_to));
    end if;
    if new.cosign_requested and not old.cosign_requested then
      insert into public.events (transaction_id, actor_id, kind, message)
        values (new.id, auth.uid(), 'cosign', 'Requested a second approver co-sign');
    end if;
    if new.second_approver is distinct from old.second_approver and new.second_approver is not null then
      insert into public.events (transaction_id, actor_id, kind, message)
        values (new.id, auth.uid(), 'cosign', 'Co-signed by ' || public.pname(new.second_approver));
    end if;
  end if;
  return null;
end $$;
drop trigger if exists transactions_after_trg on public.transactions;
create trigger transactions_after_trg after insert or update on public.transactions
  for each row execute function public.transactions_after();

-- Messages touch the parent (last update) and record the first admin response
create or replace function public.messages_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare is_adm boolean;
begin
  select role = 'admin' into is_adm from public.profiles where id = new.author_id;
  if new.ticket_id is not null then
    update public.tickets
       set updated_at = now(),
           first_response_at = case when coalesce(is_adm,false) and not new.is_internal and first_response_at is null
                                    then now() else first_response_at end
     where id = new.ticket_id;
  else
    update public.transactions set updated_at = now() where id = new.transaction_id;
  end if;
  return null;
end $$;
drop trigger if exists messages_after_trg on public.messages;
create trigger messages_after_trg after insert on public.messages
  for each row execute function public.messages_after();

-- =====================================================================
-- RPCs used by the admin UI
-- =====================================================================
-- Request a second admin to co-sign a high-value verdict
create or replace function public.request_cosign(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.transactions set cosign_requested = true where id = p_id;
end $$;

-- A different admin (not the assigned one) co-signs
create or replace function public.cosign_transaction(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.transactions;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into t from public.transactions where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if t.assigned_to = auth.uid() then raise exception 'The co-signer must be a different admin than the assigned one'; end if;
  update public.transactions set second_approver = auth.uid() where id = p_id;
end $$;

-- Issue the verdict. All guard rails live here, not in the browser.
create or replace function public.issue_verdict(p_id uuid, p_verdict text, p_justification text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.transactions; missing int;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into t from public.transactions where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if t.verdict is not null and t.verdict <> 'needs_info' then raise exception 'A verdict was already issued'; end if;
  if p_verdict not in ('safe','suspicious','needs_info') then raise exception 'Unknown verdict'; end if;
  if coalesce(btrim(p_justification), '') = '' then raise exception 'A justification is required'; end if;

  if p_verdict = 'safe' then
    select count(*) into missing from public.checklist_items ci
      where ci.required and coalesce(t.checklist->>ci.key, 'false') <> 'true';
    if missing > 0 then raise exception '% required check(s) are still open', missing; end if;
    if t.amount >= public.dual_approval_threshold() and t.second_approver is null then
      raise exception 'A second admin must co-sign before this can be marked safe';
    end if;
  end if;

  update public.transactions
     set verdict = p_verdict, status = 'verdict_issued', verdict_justification = p_justification,
         verdict_by = auth.uid(), verdict_at = now()
   where id = p_id;

  insert into public.events (transaction_id, actor_id, kind, message)
  values (p_id, auth.uid(), 'verdict',
    'Verdict issued: ' || case p_verdict when 'safe' then 'Verified safe to proceed'
                                         when 'suspicious' then 'Flagged as suspicious'
                                         else 'More information requested' end);

  if p_verdict = 'needs_info' then
    insert into public.messages (transaction_id, author_id, body, is_internal)
    values (p_id, auth.uid(), p_justification, false);
  end if;
end $$;

-- One call that powers the dashboard and the reports page
create or replace function public.admin_overview(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  since timestamptz := now() - make_interval(days => p_days);
  prev_since timestamptz := now() - make_interval(days => p_days * 2);
  bucket text := case when p_days <= 31 then 'day' else 'month' end;
  res jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  with items as (
    select created_at, priority, (status in ('new','in_progress')) as is_open, (status = 'resolved') as is_done,
           resolved_at as done_at, due_at, assigned_to
      from public.tickets where status <> 'draft'
    union all
    select created_at, priority, (verdict is null), (verdict is not null), verdict_at, due_at, assigned_to
      from public.transactions
  )
  select jsonb_build_object(
    'bucket', bucket,
    'total',      (select count(*) from items where created_at >= since),
    'total_prev', (select count(*) from items where created_at >= prev_since and created_at < since),
    'open',       (select count(*) from items where is_open),
    'resolved',   (select count(*) from items where is_done and done_at >= since),
    'avg_resolution_days',
      (select round(avg(extract(epoch from (done_at - created_at)) / 86400)::numeric, 1) from items where is_done and done_at >= since),
    'avg_resolution_days_prev',
      (select round(avg(extract(epoch from (done_at - created_at)) / 86400)::numeric, 1) from items where is_done and done_at >= prev_since and done_at < since),
    'avg_rating',   (select round(avg(rating)::numeric, 1) from public.feedback where created_at >= since),
    'rating_count', (select count(*) from public.feedback where created_at >= since),
    'sla_within',   (select count(*) from items where is_done and done_at >= since and done_at <= due_at),
    'sla_breached', (select count(*) from items where is_done and done_at >= since and done_at > due_at),
    'priority', (select coalesce(jsonb_object_agg(priority, c), '{}'::jsonb)
                   from (select priority, count(*) c from items where created_at >= since group by 1) x),
    'by_type', (select coalesce(jsonb_agg(jsonb_build_object('bucket', b, 'type', ty, 'count', c) order by b), '[]'::jsonb)
                  from (select date_trunc(bucket, created_at) b, type ty, count(*) c
                          from public.tickets where status <> 'draft' and created_at >= since group by 1, 2) x),
    'volume', (select coalesce(jsonb_agg(jsonb_build_object('bucket', b, 'opened', o, 'resolved', r) order by b), '[]'::jsonb)
                 from (select b, sum(o) o, sum(r) r
                         from (select date_trunc(bucket, created_at) b, 1 o, 0 r from items where created_at >= since
                               union all
                               select date_trunc(bucket, done_at), 0, 1 from items where is_done and done_at >= since) u
                        group by b) y),
    'top_admins', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                     from (select p.full_name as name, count(*) as resolved,
                                  (select round(avg(f.rating)::numeric, 1) from public.feedback f
                                     join public.tickets tt on tt.id = f.ticket_id where tt.assigned_to = p.id) as rating
                             from items i join public.profiles p on p.id = i.assigned_to
                            where i.is_done and i.done_at >= since
                            group by p.id, p.full_name order by count(*) desc limit 5) a)
  ) into res;
  return res;
end $$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles        enable row level security;
alter table public.admin_settings  enable row level security;
alter table public.tickets         enable row level security;
alter table public.transactions    enable row level security;
alter table public.checklist_items enable row level security;
alter table public.messages        enable row level security;
alter table public.events          enable row level security;
alter table public.attachments     enable row level security;
alter table public.feedback        enable row level security;

-- profiles: you see yourself and all admins (so users can see who handles their ticket); admins see everyone
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or role = 'admin' or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

drop policy if exists settings_select on public.admin_settings;
create policy settings_select on public.admin_settings for select to authenticated using (true);
drop policy if exists settings_update on public.admin_settings;
create policy settings_update on public.admin_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists checklist_select on public.checklist_items;
create policy checklist_select on public.checklist_items for select to authenticated using (true);

-- tickets
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert to authenticated
  with check (reporter_id = auth.uid() and status in ('draft','new'));
drop policy if exists tickets_update_own_draft on public.tickets;
create policy tickets_update_own_draft on public.tickets for update to authenticated
  using (reporter_id = auth.uid() and status = 'draft')
  with check (reporter_id = auth.uid() and status in ('draft','new'));
drop policy if exists tickets_update_admin on public.tickets;
create policy tickets_update_admin on public.tickets for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists tickets_delete_own_draft on public.tickets;
create policy tickets_delete_own_draft on public.tickets for delete to authenticated
  using (reporter_id = auth.uid() and status = 'draft');

-- transactions
drop policy if exists txn_select on public.transactions;
create policy txn_select on public.transactions for select to authenticated
  using (submitter_id = auth.uid() or public.is_admin());
drop policy if exists txn_insert on public.transactions;
create policy txn_insert on public.transactions for insert to authenticated
  with check (submitter_id = auth.uid());
drop policy if exists txn_update_admin on public.transactions;
create policy txn_update_admin on public.transactions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- messages
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using (
  public.is_admin() or (not is_internal and (
    exists (select 1 from public.tickets t where t.id = ticket_id and t.reporter_id = auth.uid()) or
    exists (select 1 from public.transactions x where x.id = transaction_id and x.submitter_id = auth.uid()))));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated with check (
  author_id = auth.uid() and (public.is_admin() or (not is_internal and (
    exists (select 1 from public.tickets t where t.id = ticket_id and t.reporter_id = auth.uid() and t.status <> 'draft') or
    exists (select 1 from public.transactions x where x.id = transaction_id and x.submitter_id = auth.uid())))));

-- events (activity log): users only see the customer-facing kinds
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated using (
  public.is_admin() or (kind in ('submitted','assigned','status','verdict') and (
    exists (select 1 from public.tickets t where t.id = ticket_id and t.reporter_id = auth.uid()) or
    exists (select 1 from public.transactions x where x.id = transaction_id and x.submitter_id = auth.uid()))));

-- attachments
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated using (
  public.is_admin() or
  exists (select 1 from public.tickets t where t.id = ticket_id and t.reporter_id = auth.uid()) or
  exists (select 1 from public.transactions x where x.id = transaction_id and x.submitter_id = auth.uid()));
drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated with check (
  uploaded_by = auth.uid() and (public.is_admin() or
    exists (select 1 from public.tickets t where t.id = ticket_id and t.reporter_id = auth.uid()) or
    exists (select 1 from public.transactions x where x.id = transaction_id and x.submitter_id = auth.uid())));

-- feedback: only for your own resolved tickets / answered transactions
drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert to authenticated with check (
  user_id = auth.uid() and (
    exists (select 1 from public.tickets t where t.id = ticket_id and t.reporter_id = auth.uid() and t.status = 'resolved') or
    exists (select 1 from public.transactions x where x.id = transaction_id and x.submitter_id = auth.uid() and x.verdict in ('safe','suspicious'))));

-- =====================================================================
-- Storage buckets
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 10485760,
        array['image/png','image/jpeg','application/pdf','text/plain','message/rfc822'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

drop policy if exists evidence_insert on storage.objects;
create policy evidence_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists evidence_select on storage.objects;
create policy evidence_select on storage.objects for select to authenticated using (
  bucket_id = 'evidence' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.is_admin() or
    exists (select 1 from public.attachments a where a.file_path = name)));

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
