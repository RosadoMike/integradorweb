create table if not exists public.reports (
  id text primary key,
  technician text not null check (char_length(technician) between 1 and 80),
  customer text not null check (char_length(customer) between 1 and 100),
  phone text not null default '' check (char_length(phone) <= 30),
  service_type text not null check (char_length(service_type) between 1 and 40),
  priority text not null check (priority in ('Normal', 'Alta', 'Urgente')),
  address text not null check (char_length(address) between 1 and 180),
  description text not null check (char_length(description) between 1 and 1500),
  created_at timestamptz not null,
  status text not null default 'abierto' check (status = 'abierto')
);

alter table public.reports enable row level security;
