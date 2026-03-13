-- Copy That v1 Schema
-- Run this in the Supabase SQL Editor

-- Profiles (linked to auth.users)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  last_active_at timestamptz default now(),
  marketing_consent boolean default true,
  marketing_consent_date timestamptz default now(),
  generation_count_today integer default 0,
  generation_count_date date default current_date,
  total_generations integer default 0,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Users can manage own profile"
  on profiles for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Brand Contexts
create table brand_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  is_default boolean default false,
  business_name text not null,
  business_description text,
  audience text,
  tone text,
  tone_examples text,
  competitors text,
  source_url text,
  source_content jsonb,
  competitor_url text,
  competitor_analysis text,
  voice_profile text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table brand_contexts enable row level security;

create policy "Users can manage own brand contexts"
  on brand_contexts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Copy Blocks
create table copy_blocks (
  id uuid primary key default gen_random_uuid(),
  brand_context_id uuid references brand_contexts on delete cascade not null,
  component_type text not null,
  content jsonb not null,
  ai_notes jsonb,
  version integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table copy_blocks enable row level security;

create policy "Users can manage own copy blocks"
  on copy_blocks for all
  using (brand_context_id in (select id from brand_contexts where user_id = auth.uid()))
  with check (brand_context_id in (select id from brand_contexts where user_id = auth.uid()));

-- Usage Log
create type usage_event_type as enum (
  'generation', 'voice_extraction', 'url_extraction', 'export', 'auth'
);

create table usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete set null,
  session_id text,
  event_type usage_event_type not null,
  component_type text,
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz default now()
);

alter table usage_log enable row level security;

create policy "Authenticated users can insert own usage logs"
  on usage_log for insert
  with check (user_id = auth.uid());

-- Indexes
create index idx_brand_contexts_user_id on brand_contexts(user_id);
create index idx_copy_blocks_brand_context_id on copy_blocks(brand_context_id);
create index idx_usage_log_user_id on usage_log(user_id);
create index idx_usage_log_created_at on usage_log(created_at);
