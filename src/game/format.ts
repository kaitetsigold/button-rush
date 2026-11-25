export function formatTime(ms: number): string {
  const c = Math.max(0, Math.floor(ms));
  const m = Math.floor(c / 60000);
  const s = Math.floor((c % 60000) / 1000);
  const cs = Math.floor((c % 1000) / 10);
  return `${m}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

export function formatSeconds(seconds: number): string {
  return formatTime(seconds * 1000);
}
