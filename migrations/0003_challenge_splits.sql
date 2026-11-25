alter table runs add column if not exists rider_ms integer not null default 0;
alter table runs add column if not exists daruma_ms integer not null default 0;

alter table runs drop constraint if exists runs_times;

alter table runs add constraint runs_times check (
  easy_ms > 0
  and mid_ms > 0
  and hard_ms > 0
  and rider_ms >= 0
  and daruma_ms >= 0
  and total_ms = easy_ms + mid_ms + hard_ms + rider_ms + daruma_ms
);
