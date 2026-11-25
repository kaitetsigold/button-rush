import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { stageMinMs, TIER_IDS, type TierId } from "@/game/course";

export type BoardRow = {
  id: number;
  tag: string;
  totalMs: number;
  easyMs: number;
  midMs: number;
  hardMs: number;
  riderMs: number;
  darumaMs: number;
};

// Substrings that may not appear in a name once spacing and look-alike digits
// are normalised. Extend as needed.
// Kept short on purpose: shorter fragments like "fag", "shit" or "dick" would
// block real names (Fagbemi, Shittu, Dickson).
const BLOCKED = ["fuck", "bitch", "cunt", "pussy", "nigg", "nazi", "hitler"];

function isCleanTag(tag: string): boolean {
  const flat = tag
    .toLowerCase()
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[^a-z]/g, "");
  return !BLOCKED.some((w) => flat.includes(w));
}

const tagSchema = z
  .string()
  .trim()
  .min(2)
  .max(14)
  .regex(/^[A-Za-z0-9 ]+$/)
  .refine(isCleanTag, "Pick a different name.");

// Attempts older than 120 minutes are deleted on the next start; they can never
// be submitted (the cap is 5 stages x 20 min, and the clock check is tighter).
// Global ceiling on new attempts per minute; blocks table-spamming scripts.
const MAX_ATTEMPTS_PER_MINUTE = 120;

const submitSchema = z.object({
  attemptId: z.string().regex(/^[0-9a-f-]{36}$/i),
  tag: tagSchema,
  easyMs: z.number().int(),
  midMs: z.number().int(),
  hardMs: z.number().int(),
  riderMs: z.number().int(),
  darumaMs: z.number().int(),
});

function mins(): Record<TierId, number> {
  return {
    hand: stageMinMs("hand"),
    roo: stageMinMs("roo"),
    derby: stageMinMs("derby"),
    rider: stageMinMs("rider"),
    daruma: stageMinMs("daruma"),
  };
}

function mapRow(row: {
  id: number;
  tag: string;
  total_ms: number;
  easy_ms: number;
  mid_ms: number;
  hard_ms: number;
  rider_ms: number;
  daruma_ms: number;
}): BoardRow {
  return {
    id: Number(row.id),
    tag: row.tag,
    totalMs: Number(row.total_ms),
    easyMs: Number(row.easy_ms),
    midMs: Number(row.mid_ms),
    hardMs: Number(row.hard_ms),
    riderMs: Number(row.rider_ms),
    darumaMs: Number(row.daruma_ms),
  };
}

async function top(): Promise<BoardRow[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: number;
    tag: string;
    total_ms: number;
    easy_ms: number;
    mid_ms: number;
    hard_ms: number;
    rider_ms: number;
    daruma_ms: number;
  }>`select id, tag, total_ms, easy_ms, mid_ms, hard_ms, rider_ms, daruma_ms
     from runs
     order by total_ms asc, id asc
     limit 30`;
  return rows.map(mapRow);
}

export const listBoard = createServerFn({ method: "GET" }).handler(async () => {
  return top();
});

export const startAttempt = createServerFn({ method: "POST" }).handler(async () => {
  const sql = await getSql();
  await sql`delete from attempts where started_at < now() - interval '120 minutes'`;
  const recent = await sql<{ n: number }>`
    select count(*)::int as n from attempts where started_at > now() - interval '1 minute'
  `;
  if (Number(recent[0]?.n ?? 0) >= MAX_ATTEMPTS_PER_MINUTE) {
    throw new Error("Too many runs starting right now. Try again in a minute.");
  }
  const id = crypto.randomUUID();
  await sql`insert into attempts (id) values (${id})`;
  return { id };
});

export const submitRun = createServerFn({ method: "POST" })
  .validator((input: unknown) => submitSchema.parse(input))
  .handler(async ({ data }) => {
    const tag = data.tag.trim().replace(/\s+/g, " ");
    const easyMs = data.easyMs;
    const midMs = data.midMs;
    const hardMs = data.hardMs;
    const riderMs = data.riderMs;
    const darumaMs = data.darumaMs;
    const total = easyMs + midMs + hardMs + riderMs + darumaMs;
    const floor = mins();
    const cap = 20 * 60 * 1000;
    const times = [easyMs, midMs, hardMs, riderMs, darumaMs];
    if (times.some((ms, i) => ms < floor[TIER_IDS[i] ?? "hand"])) {
      throw new Error("That time is faster than this course allows.");
    }
    if (times.some((ms) => ms > cap)) {
      throw new Error("That time is too long to rank.");
    }
    const sql = await getSql();
    const found = await sql<{ elapsed: number }>`
      select extract(epoch from (now() - started_at)) * 1000 as elapsed
      from attempts
      where id = ${data.attemptId}
    `;
    const elapsed = Number(found[0]?.elapsed);
    if (!Number.isFinite(elapsed)) throw new Error("This run has already been recorded.");
    if (total > elapsed + 8000) throw new Error("The clock doesn't match this run.");
    if (total + 45000 < elapsed) throw new Error("The clock doesn't match this run.");
    await sql`delete from attempts where id = ${data.attemptId}`;
    await sql`
      insert into runs (tag, total_ms, easy_ms, mid_ms, hard_ms, rider_ms, daruma_ms)
      values (${tag}, ${total}, ${easyMs}, ${midMs}, ${hardMs}, ${riderMs}, ${darumaMs})
    `;
    const faster = await sql<{ n: number }>`select count(*)::int as n from runs where total_ms < ${total}`;
    const rank = Number(faster[0]?.n ?? 0) + 1;
    return { rank, totalMs: total, board: await top() };
  });
