/** Created by Avrelin Aleksei. Copyright 2026 Avrelin Aleksei. */
export type HistoryPoint = { at: string; score: number };
export type HistoryBucket = { at: string; score: number | null; from: string; to: string };
export type ProgressScale = "runs" | "days" | "weeks" | "months";
export type HistoryChange<T> = {
  item: T;
  previousScore: number;
  delta: number;
  becameCovered: boolean;
  lostCoverage: boolean;
};

export function parseStamp(at: string): Date {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

export function mondayUtc(date: Date): Date {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() - (weekday - 1));
  return utc;
}

export function weekKey(date: Date): string {
  return mondayUtc(date).toISOString().slice(0, 10);
}

export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastInBucket(points: HistoryPoint[], keyOf: (date: Date) => string): HistoryPoint[] {
  const buckets = new Map<string, HistoryPoint>();
  for (const point of points) buckets.set(keyOf(parseStamp(point.at)), point);
  return [...buckets.values()];
}

export function scaleHistory(points: HistoryPoint[], scale: ProgressScale): HistoryPoint[] {
  const ordered = [...points].sort((left, right) => left.at.localeCompare(right.at));
  if (scale === "days") return lastInBucket(ordered, dayKey);
  if (scale === "weeks") return lastInBucket(ordered, weekKey);
  if (scale === "months") return lastInBucket(ordered, monthKey);
  return ordered;
}

export function averageHistory(points: HistoryPoint[], startDate: string, endDate: string, bucketCount = 14, latestDate?: string): HistoryBucket[] {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T23:59:59.999Z`);
  const latest = latestDate ? Date.parse(`${latestDate}T23:59:59.999Z`) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end > latest || bucketCount < 1) return [];

  const dayMs = 24 * 60 * 60 * 1000;
  const startDay = Date.parse(`${startDate}T00:00:00.000Z`);
  const endDay = Date.parse(`${endDate}T00:00:00.000Z`);
  const dayCount = Math.floor((endDay - startDay) / dayMs) + 1;
  const count = Math.min(bucketCount, Math.max(1, dayCount));
  const duration = Math.max(1, end - start + 1);
  const daily = dayCount <= bucketCount;
  const buckets = Array.from({ length: count }, () => [] as HistoryPoint[]);
  for (const point of points) {
    const timestamp = parseStamp(point.at).getTime();
    if (timestamp < start || timestamp > end) continue;
    const index = daily
      ? Math.min(count - 1, Math.floor((timestamp - startDay) / dayMs))
      : Math.min(count - 1, Math.floor(((timestamp - start) / duration) * count));
    buckets[index].push(point);
  }

  return buckets.flatMap((bucket, index) => {
    const bucketStart = daily ? startDay + index * dayMs : start + (duration * index) / count;
    const bucketEnd = daily ? Math.min(end, bucketStart + dayMs - 1) : start + (duration * (index + 1)) / count - 1;
    const timestamp = index === 0 ? start : index === count - 1 ? end : Math.round((bucketStart + bucketEnd) / 2);
    const from = new Date(bucketStart).toISOString().slice(0, 10);
    const to = new Date(bucketEnd).toISOString().slice(0, 10);
    return [{
      at: new Date(timestamp).toISOString(),
      score: bucket.length ? bucket.reduce((sum, point) => sum + point.score, 0) / bucket.length : null,
      from,
      to,
    }];
  });
}

export function compareHistory<T extends { score: number; history?: HistoryPoint[] }>(rows: T[]): HistoryChange<T>[] {
  return rows.flatMap((item) => {
    const history = item.history || [];
    const previous = history[history.length - 1];
    if (!previous) return [];
    const delta = item.score - previous.score;
    if (delta === 0) return [];
    return [{
      item,
      previousScore: previous.score,
      delta,
      becameCovered: item.score >= 100 && previous.score < 100,
      lostCoverage: item.score < 100 && previous.score >= 100,
    }];
  });
}

export function barLabel(point: HistoryPoint, scale: ProgressScale, lang: string): string {
  const date = parseStamp(point.at);
  if (scale === "months") {
    return date.toLocaleDateString(lang, { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  if (scale === "days") {
    return date.toLocaleDateString(lang, { day: "numeric", month: "short", timeZone: "UTC" });
  }
  if (scale === "weeks") {
    const start = mondayUtc(date);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const format = (value: Date) => value.toLocaleDateString(lang, { day: "numeric", month: "short", timeZone: "UTC" });
    return `${format(start)} — ${format(end)}`;
  }
  return date.toLocaleString(lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function chartLabelLines(point: HistoryPoint, scale: ProgressScale, lang: string): string[] {
  const date = parseStamp(point.at);
  if (scale === "weeks") {
    const start = mondayUtc(date);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const format = (value: Date) => value.toLocaleDateString(lang, { day: "numeric", month: "short", timeZone: "UTC" });
    return [format(start), format(end)];
  }
  if (scale === "runs") {
    return [
      date.toLocaleDateString(lang, { day: "numeric", month: "short", timeZone: "UTC" }),
      date.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }),
    ];
  }
  return [barLabel(point, scale, lang)];
}

export function bucketLabelLines(bucket: HistoryBucket, lang: string): string[] {
  const format = (value: string) => new Date(`${value}T00:00:00.000Z`).toLocaleDateString(lang, { day: "numeric", month: "short", timeZone: "UTC" });
  const from = format(bucket.from);
  const to = format(bucket.to);
  return from === to ? [from] : [from, to];
}
