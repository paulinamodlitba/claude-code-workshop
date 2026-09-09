create extension if not exists "pgcrypto";

create table course_dates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  track text not null check (track in ('svenska', 'menti_en')),
  capacity integer not null,
  created_at timestamptz not null default now()
);

create table participants (
  id uuid primary key default gen_random_uuid(),
  course_date_id uuid references course_dates(id),
  name text not null,
  email text not null,
  amount_paid_sek integer not null default 0,
  discount_code text,
  stripe_checkout_session_id text unique,
  zoom_invite_sent boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  source text not null check (source in ('formulär', 'manuellt', 'nastan_betalare')),
  status text not null default 'ny' check (status in ('ny', 'kontaktad')),
  interested_course_date_id uuid references course_dates(id),
  stripe_checkout_session_id text unique,
  is_subscriber boolean,
  note text,
  created_at timestamptz not null default now()
);

create index idx_participants_course_date on participants (course_date_id);
create index idx_leads_course_date on leads (interested_course_date_id);
create index idx_leads_email on leads (email);
create index idx_participants_email on participants (email);
