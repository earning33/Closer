-- CLOSER Admin Dashboard: server-side moderation permissions.
-- These policies rely on the existing private.is_admin() SECURITY DEFINER helper,
-- which checks membership in public.admin_roles. Do not remove that check or
-- expose admin service-role credentials in the browser.

drop policy if exists posts_admin_select on public.posts;
create policy posts_admin_select
on public.posts for select to authenticated
using ((select private.is_admin()));

drop policy if exists posts_admin_update on public.posts;
create policy posts_admin_update
on public.posts for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists posts_admin_delete on public.posts;
create policy posts_admin_delete
on public.posts for delete to authenticated
using ((select private.is_admin()));

drop policy if exists stories_admin_select on public.stories;
create policy stories_admin_select
on public.stories for select to authenticated
using ((select private.is_admin()));

drop policy if exists stories_admin_update on public.stories;
create policy stories_admin_update
on public.stories for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists stories_admin_delete on public.stories;
create policy stories_admin_delete
on public.stories for delete to authenticated
using ((select private.is_admin()));

drop policy if exists post_comments_admin_delete on public.post_comments;
create policy post_comments_admin_delete
on public.post_comments for delete to authenticated
using ((select private.is_admin()));
