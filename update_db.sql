ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Update Additives policy to restrict inserts to admins only
DROP POLICY IF EXISTS "Public can insert additives for seeding." ON additives;
DROP POLICY IF EXISTS "Admins can insert additives." ON additives;
CREATE POLICY "Admins can insert additives." ON additives FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);
DROP POLICY IF EXISTS "Admins can update additives." ON additives;
CREATE POLICY "Admins can update additives." ON additives FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);

-- Update pending_additives policy
DROP POLICY IF EXISTS "Admins can update pending_additives." ON pending_additives;
CREATE POLICY "Admins can update pending_additives." ON pending_additives FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);
DROP POLICY IF EXISTS "Admins can delete pending_additives." ON pending_additives;
CREATE POLICY "Admins can delete pending_additives." ON pending_additives FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);

-- Also fix profiles so users can insert on signup (Trigger or manual).
-- Actually, inserting to profiles on signup is often done via a trigger.
-- Let's create a trigger to auto-create a profile on auth.users insert.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username, is_admin)
  values (new.id, new.email, false);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
