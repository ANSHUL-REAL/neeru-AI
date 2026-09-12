create table if not exists desks (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  lat double precision,
  lng double precision,
  verdict text,
  rain_mm_hr double precision,
  created_at timestamptz default now()
);

create table if not exists audit (
  id bigserial primary key,
  desk_id uuid references desks (id) on delete cascade,
  seq int,
  type text,
  actor text,
  detail text,
  payload jsonb,
  created_at timestamptz default now()
);

create table if not exists actions (
  id text primary key,
  desk_id uuid references desks (id) on delete cascade,
  kind text,
  title text,
  instruction text,
  status text,
  updated_at timestamptz default now()
);

alter table desks enable row level security;
alter table audit enable row level security;
alter table actions enable row level security;

create policy "desks open" on desks for all using (true) with check (true);
create policy "audit open" on audit for all using (true) with check (true);
create policy "actions open" on actions for all using (true) with check (true);

create table if not exists call_log (
  id text primary key,
  kind text,
  title text,
  detail text,
  created_at timestamptz default now()
);

alter table call_log enable row level security;
create policy "call_log open" on call_log for all using (true) with check (true);
