// Streak, level, XP and lock tests. Run with `npm test`.
import assert from "node:assert/strict";
import {
  computeSessionXp,
  computeStreak,
  dayKey,
  lastNDayKeys,
  levelInfo,
  previousDayKey,
  xpForLevel
} from "../src/lib/progress.js";
import { createLock } from "../src/lib/lock.js";

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    failures.push({ name, error });
  }
}

const NOW = new Date(2026, 8, 18, 15, 0, 0).getTime();
const today = dayKey(NOW);
const yesterday = previousDayKey(today);
const twoAgo = previousDayKey(yesterday);

await test("previousDayKey crosses a month boundary", () => assert.equal(previousDayKey("2026-03-01"), "2026-02-28"));
await test("previousDayKey crosses a year boundary", () => assert.equal(previousDayKey("2026-01-01"), "2025-12-31"));
await test("lastNDayKeys returns 7 ordered keys ending today", () => {
  const keys = lastNDayKeys(7, NOW);
  assert.equal(keys.length, 7);
  assert.equal(keys[6], today);
  assert.equal(keys[5], yesterday);
});

await test("streak counts consecutive qualified days", () => {
  const daily = { [today]: { qualified: true }, [yesterday]: { qualified: true }, [twoAgo]: { qualified: true } };
  assert.equal(computeStreak(daily, NOW), 3);
});
await test("streak survives when today has not qualified yet", () => {
  const daily = { [yesterday]: { qualified: true }, [twoAgo]: { qualified: true } };
  assert.equal(computeStreak(daily, NOW), 2);
});
await test("a gap breaks the streak", () => {
  const daily = { [today]: { qualified: true }, [twoAgo]: { qualified: true } };
  assert.equal(computeStreak(daily, NOW), 1);
});
await test("no data means no streak", () => assert.equal(computeStreak({}, NOW), 0));

await test("level curve is about 60 * n per level", () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 60);
  assert.equal(xpForLevel(3), 180);
  assert.equal(xpForLevel(4), 360);
});
await test("levelInfo reports progress into the level", () => {
  const info = levelInfo(90);
  assert.equal(info.level, 2);
  assert.equal(info.into, 30);
  assert.equal(info.needed, 120);
});
await test("levelInfo handles zero and junk", () => {
  assert.equal(levelInfo(0).level, 1);
  assert.equal(levelInfo("nope").level, 1);
});

await test("XP is 1 per focused minute plus bonuses", () => {
  const plain = computeSessionXp({ focusedSeconds: 25 * 60, completed: false, goodResponses: 0 });
  assert.equal(plain.focus, 25);
  assert.equal(plain.total, 25);
  const full = computeSessionXp({ focusedSeconds: 25 * 60, completed: true, goodResponses: 2 });
  assert.ok(full.completion > 0, "completion bonus");
  assert.ok(full.prompts > 0, "good-answer bonus");
  assert.equal(full.total, full.focus + full.completion + full.prompts);
});

await test("lock runs tasks strictly in order", async () => {
  const run = createLock();
  const order = [];
  const slow = run(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push("slow");
  });
  const fast = run(async () => order.push("fast"));
  await Promise.all([slow, fast]);
  assert.deepEqual(order, ["slow", "fast"]);
});
await test("lock keeps going after a task throws", async () => {
  const run = createLock();
  await assert.rejects(run(async () => { throw new Error("boom"); }));
  assert.equal(await run(async () => 42), 42);
});

for (const { name, error } of failures) {
  console.error(`  FAIL ${name}\n       ${error.message.split("\n")[0]}`);
}
console.log(`progress: ${passed} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
