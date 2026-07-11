-- Supabase Schema for AdditiveAlert

-- Create User Profiles table
create table public.profiles (
  id uuid references auth.users not null,
  updated_at timestamp with time zone,
  username text unique,
  avatar_url text,
  allergies text[], -- array of allergies/concerns
  primary key (id)
);

-- Enable RLS for profiles
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone." on profiles for select using (true);
create policy "Users can insert their own profile." on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on profiles for update using (auth.uid() = id);

-- Create Scan History table
create table public.scan_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  scanned_at timestamp with time zone default timezone('utc'::text, now()) not null,
  ingredient_name text not null,
  e_number text,
  rating integer not null,
  risk_level text
);

-- Enable RLS for scan history
alter table public.scan_history enable row level security;
create policy "Users can view their own scan history." on scan_history for select using (auth.uid() = user_id);
create policy "Users can insert their own scan history." on scan_history for insert with check (auth.uid() = user_id);
create policy "Users can delete their own scan history." on scan_history for delete using (auth.uid() = user_id);
