create table if not exists attempts (
  id text primary key,
  started_at timestamptz not null default now()
);

create table if not exists runs (
  id serial primary key,
  tag text not null,
  total_ms integer not null,
  easy_ms integer not null,
  mid_ms integer not null,
  hard_ms integer not null,
  created_at timestamptz not null default now(),
  constraint runs_tag_len check (char_length(tag) between 2 and 14),
  constraint runs_times check (
    easy_ms > 0
    and mid_ms > 0
    and hard_ms > 0
    and total_ms = easy_ms + mid_ms + hard_ms
  )
);

create index if not exists runs_total_idx on runs (total_ms asc, id asc);
