-- OPTIONAL demo data. Run AFTER schema.sql and AFTER you have:
--   1) signed up one normal user in the app, and
--   2) promoted one account to admin:  update public.profiles set role = 'admin' where email = 'you@example.com';
do $$
declare u uuid; a uuid; t1 uuid; t2 uuid; x1 uuid;
begin
  select id into u from public.profiles where role = 'user'  order by created_at limit 1;
  select id into a from public.profiles where role = 'admin' order by created_at limit 1;
  if u is null or a is null then
    raise notice 'Need at least one user and one admin profile first. Nothing inserted.';
    return;
  end if;

  insert into public.tickets (reporter_id, type, subject, description, severity, status, occurred_at, sender_domain, category, affected_users)
  values (u, 'Phishing', 'Suspicious invoice email with fake payment link',
          'We received an email that looks like it''s from our payment processor asking us to "confirm" our account through a link. Two staff members clicked it before we noticed. Nobody has entered a password yet, but we''d like to be sure our accounts are safe.',
          'high', 'new', now() - interval '2 days', 'brtbakery-billing.com', 'Credential Phishing', 2)
  returning id into t1;
  update public.tickets set status = 'in_progress', assigned_to = a where id = t1;
  insert into public.messages (ticket_id, author_id, body) values
    (t1, u, 'Hi, two of us clicked the link in that email. Should we change our passwords right away?'),
    (t1, a, 'Yes — please reset the passwords on both affected accounts now. I''m pulling the email headers and checking where the link goes.');
  insert into public.messages (ticket_id, author_id, body, is_internal) values
    (t1, a, 'Link resolves to a lookalike domain registered 6 days ago. Blocking it at the gateway and checking whether other recipients got the same email.', true);

  insert into public.tickets (reporter_id, type, subject, description, severity, status)
  values (u, 'Malware', 'Antivirus flagged a file on the front-desk PC', 'Quarantined automatically. Want someone to confirm it is clean.', 'medium', 'new')
  returning id into t2;
  update public.tickets set status = 'resolved', assigned_to = a where id = t2;

  insert into public.tickets (reporter_id, type, subject, description, severity, status)
  values (u, 'Suspicious Link', 'Link in a supplier text message', 'The link asks us to update delivery details.', 'low', 'new');

  insert into public.transactions (submitter_id, recipient_name, channel, account_number, amount, request_source, notes)
  values (u, 'JR Reyes Supplies', 'Bank Transfer', '0412-3391-8871', 82300,
          'Email — invoice@jrreyes-supplyco.net',
          'Received an urgent invoice asking us to pay to a new account instead of our usual supplier account.')
  returning id into x1;

  insert into public.transactions (submitter_id, recipient_name, channel, account_number, amount, request_source, notes)
  values (u, 'JR Reyes', 'GCash', '0917-000-0000', 15000, 'Messenger', 'Regular supplier, new number.');

  raise notice 'Demo data inserted for user % and admin %.', u, a;
end $$;
