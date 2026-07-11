-- Supabase Schema for AdditiveAlert

-- 1. User Profiles Table
create table public.profiles (
  id uuid references auth.users not null,
  updated_at timestamp with time zone,
  username text unique,
  avatar_url text,
  allergies text[], 
  primary key (id)
);

alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone." on profiles for select using (true);
create policy "Users can insert their own profile." on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on profiles for update using (auth.uid() = id);

-- 2. Scan History Table
create table public.scan_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  scanned_at timestamp with time zone default timezone('utc'::text, now()) not null,
  ingredient_name text not null,
  e_number text,
  rating integer not null,
  risk_level text
);

alter table public.scan_history enable row level security;
create policy "Users can view their own scan history." on scan_history for select using (auth.uid() = user_id);
create policy "Users can insert their own scan history." on scan_history for insert with check (auth.uid() = user_id);
create policy "Users can delete their own scan history." on scan_history for delete using (auth.uid() = user_id);

-- 3. Additives Database Table (Public Read, Admin Write)
create table public.additives (
  id text primary key, -- e.g., 'E100' or string name
  name text not null,
  english_name text,
  rating integer not null,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.additives enable row level security;
create policy "Additives are viewable by everyone." on additives for select using (true);
-- To allow the seed script to work without an admin token, we temporarily allow public inserts.
-- You should remove this policy in production!
create policy "Public can insert additives for seeding." on additives for insert with check (true);

-- 4. Pending Additives Table (Public Insert, Admin Read/Review)
create table public.pending_additives (
  id uuid default gen_random_uuid() primary key,
  scanned_name text not null,
  scanned_at timestamp with time zone default timezone('utc'::text, now()) not null,
  status text default 'pending' -- 'pending', 'approved', 'rejected'
);

alter table public.pending_additives enable row level security;
create policy "Anyone can insert a pending additive." on pending_additives for insert with check (true);
-- Only authenticated users/admins can view the pending list
create policy "Users can view pending additives." on pending_additives for select using (auth.uid() is not null);
