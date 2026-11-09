# CLOSER Admin Dashboard setup

The production Admin Dashboard is part of the main CLOSER app and is shown only after the signed-in Supabase user has a row in `public.admin_roles`. The browser uses the normal Supabase publishable key and the user's session; it does not contain a service-role key.

## First Super Admin

The current project database was empty when the Admin Dashboard was deployed (zero Auth users and zero admin-role rows). Do not add a public/self-service first-admin bootstrap. First, create the owner's account through the live CLOSER sign-up screen and verify its email. Then a trusted project owner should run this one-time SQL in the Supabase SQL Editor, replacing the email with that verified account's email:

```sql
insert into public.admin_roles (user_id, role)
select id, 'Super Admin'
from auth.users
where lower(email) = lower('YOUR_VERIFIED_OWNER_EMAIL')
  and email_confirmed_at is not null
on conflict (user_id)
do update set role = excluded.role;
```

The insert returns no row if the email does not belong to an Auth user with a confirmed email. Never promote an unverified or unknown account.

## Use the Admin Dashboard

1. Sign in to the CLOSER website with the promoted account.
2. The **Admin Dashboard** item appears in the left navigation.
3. Use Overview, Users, Reports, Content, Verifications, Admin roles, Settings, and Audit log.
4. Only a Super Admin can grant or revoke admin roles from the Admin roles tab. A new admin must already have a registered CLOSER account.

## Permissions and safety

- Page navigation is hidden from users without an admin role.
- Data access is enforced by Supabase Row Level Security, not just by hiding the page.
- Admin actions are recorded in `public.audit_logs`.
- User status changes update the profile status; users are blocked by the app at their next session/profile check. This UI does not revoke an already-issued Supabase access token immediately.
- Administrative role types are stored as `Super Admin`, `Moderator`, `Support`, and `Finance`. In the current database policy model, all assigned admin roles satisfy `private.is_admin()`; role management itself remains Super-Admin-only. Do not assign an admin role unless that person should have the current Admin workspace permissions.
- The additional server-side moderation policies are documented in `supabase/admin-dashboard-policies.sql`.

