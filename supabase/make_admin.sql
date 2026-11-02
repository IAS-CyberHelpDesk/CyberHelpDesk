-- Promote an existing user to administrator.
-- 1) Sign up normally in the app (Enterprise User tab -> Sign Up)
-- 2) Replace the email below and run this in the SQL Editor
update public.profiles
   set role = 'admin', admin_title = 'Senior Support Admin'
 where email = 'jaysonvilla774@gmail.com', 'renrenregidor@gmail.com';
