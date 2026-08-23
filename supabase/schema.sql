-- ============================================================
-- Attendance Automation - Supabase schema
-- Run this in the Supabase SQL editor (or `supabase db push`)
-- ============================================================

-- 1. Projects: one per spreadsheet the user connects
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source_type text not null check (source_type in ('google_sheet', 'file_upload')),
  sheet_url text,              -- for google_sheet: the published/shareable URL
  storage_path text,           -- for file_upload: path in Supabase Storage
  day_start_time time not null default '06:00:00', -- the "boundary" time, e.g. 06:00
  employee_list text[] not null default '{}',      -- fixed employee names, in display order
  created_at timestamptz not null default now(),
  last_synced_at timestamptz
);

alter table projects enable row level security;

create policy "Users can manage their own projects"
  on projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Raw attendance events, synced (read-only) from the sheet
create table if not exists attendance_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  employee text not null,
  event_type text not null check (event_type in ('check-in', 'check-out', 'break-start', 'break-end')),
  category text,               -- e.g. RM / OS, optional passthrough field
  event_timestamp timestamptz not null,
  raw_row jsonb,                -- original row, kept for debugging/audit
  created_at timestamptz not null default now(),
  -- prevent duplicate imports of the exact same punch on re-sync
  unique (project_id, employee, event_type, event_timestamp)
);

create index if not exists idx_events_project_time
  on attendance_events (project_id, event_timestamp desc);

alter table attendance_events enable row level security;

create policy "Users can read events for their own projects"
  on attendance_events for select
  using (
    exists (
      select 1 from projects
      where projects.id = attendance_events.project_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Users can insert events for their own projects"
  on attendance_events for insert
  with check (
    exists (
      select 1 from projects
      where projects.id = attendance_events.project_id
      and projects.user_id = auth.uid()
    )
  );

-- Note: no update/delete policies -- events are append-only / read-only by design,
-- matching the "read-only access to the spreadsheet" requirement.
