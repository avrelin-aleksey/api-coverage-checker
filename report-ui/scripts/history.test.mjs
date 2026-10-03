import assert from "node:assert/strict";
import test from "node:test";
import { averageHistory, compareHistory, scaleHistory } from "../src/history.ts";

const points = [
  { at: "2026-01-05T10:00:00.000Z", score: 10 },
  { at: "2026-01-12T10:00:00.000Z", score: 20 },
  { at: "2026-01-31T10:00:00.000Z", score: 30 },
  { at: "2026-02-02T10:00:00.000Z", score: 40 },
];

test("runs keep every point in chronological order", () => {
  assert.deepEqual(scaleHistory(points, "runs").map((point) => point.score), [10, 20, 30, 40]);
});

test("weeks keep the last report from each Monday-based week", () => {
  assert.deepEqual(scaleHistory(points, "weeks").map((point) => point.score), [10, 20, 30, 40]);
});

test("months keep the last report from each calendar month", () => {
  assert.deepEqual(scaleHistory(points, "months").map((point) => point.score), [30, 40]);
});

test("days keep the last report from each calendar day", () => {
  const daily = [
    { at: "2026-01-05T10:00:00.000Z", score: 10 },
    { at: "2026-01-05T18:00:00.000Z", score: 15 },
    { at: "2026-01-06T10:00:00.000Z", score: 20 },
  ];
  assert.deepEqual(scaleHistory(daily, "days").map((point) => point.score), [15, 20]);
});

test("a one-day custom period creates one daily bucket and averages its reports", () => {
  const averaged = averageHistory([
    { at: "2026-01-01T10:00:00.000Z", score: 10 },
    { at: "2026-01-01T18:00:00.000Z", score: 20 },
  ], "2026-01-01", "2026-01-01", 14, "2026-01-10");
  assert.equal(averaged.length, 1);
  assert.equal(averaged[0].score, 15);
  assert.equal(averaged[0].from, "2026-01-01");
  assert.equal(averaged[0].to, "2026-01-01");
});

test("a multi-day custom period keeps empty days as null buckets", () => {
  const averaged = averageHistory([
    { at: "2026-01-01T10:00:00.000Z", score: 10 },
    { at: "2026-01-03T10:00:00.000Z", score: 30 },
  ], "2026-01-01", "2026-01-03", 14, "2026-01-10");
  assert.equal(averaged.length, 3);
  assert.deepEqual(averaged.map((point) => point.score), [10, null, 30]);
  assert.equal(averaged[0].at, "2026-01-01T00:00:00.000Z");
  assert.equal(averaged[2].at, "2026-01-03T23:59:59.999Z");
  assert.deepEqual(averaged.map((point) => [point.from, point.to]), [
    ["2026-01-01", "2026-01-01"],
    ["2026-01-02", "2026-01-02"],
    ["2026-01-03", "2026-01-03"],
  ]);
});

test("long custom periods use at most fourteen fixed buckets and average values", () => {
  const averaged = averageHistory([
    { at: "2026-01-01T10:00:00.000Z", score: 10 },
    { at: "2026-01-02T10:00:00.000Z", score: 20 },
    { at: "2026-01-30T10:00:00.000Z", score: 30 },
  ], "2026-01-01", "2026-01-31", 14, "2026-02-01");
  assert.equal(averaged.length, 14);
  assert.equal(averaged[0].score, 15);
  assert.equal(averaged[0].from, "2026-01-01");
  assert.equal(averaged[13].to, "2026-01-31");
});

test("a future custom period is rejected", () => {
  const averaged = averageHistory(points, "2026-10-04", "2026-10-05", 14, "2026-10-03");
  assert.deepEqual(averaged, []);
});

test("custom bucket boundaries are always present even without reports", () => {
  const averaged = averageHistory([], "2026-01-01", "2026-01-10", 2, "2026-01-10");
  assert.equal(averaged.length, 2);
  assert.deepEqual(averaged.map((point) => point.score), [null, null]);
  assert.equal(averaged[0].at, "2026-01-01T00:00:00.000Z");
  assert.equal(averaged[1].at, "2026-01-10T23:59:59.999Z");
});

test("comparison reports improved, regressed, and fully covered operations", () => {
  const changes = compareHistory([
    { score: 100, history: [{ at: points[0].at, score: 60 }] },
    { score: 40, history: [{ at: points[0].at, score: 100 }] },
    { score: 50, history: [{ at: points[0].at, score: 50 }] },
  ]);
  assert.equal(changes.length, 2);
  assert.equal(changes[0].becameCovered, true);
  assert.equal(changes[1].lostCoverage, true);
});
