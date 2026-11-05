// Self-check for pageWindow. No test framework on purpose:
//   node --experimental-strip-types src/utils/pagination.check.ts
import assert from "node:assert/strict";
import { pageWindow } from "./pagination.ts";

// Short pagers list every page, no ellipsis.
assert.deepEqual(pageWindow(1, 1), [1]);
assert.deepEqual(pageWindow(1, 3), [1, 2, 3]);
assert.deepEqual(pageWindow(2, 4), [1, 2, 3, 4]);

// Middle of a long pager gets an ellipsis on both sides.
assert.deepEqual(pageWindow(7, 12), [1, "...", 6, 7, 8, "...", 12]);

// Near the edges only the far side collapses.
assert.deepEqual(pageWindow(1, 12), [1, 2, "...", 12]);
assert.deepEqual(pageWindow(12, 12), [1, "...", 11, 12]);

// A single skipped page becomes that page, never an ellipsis hiding one page.
assert.deepEqual(pageWindow(3, 5), [1, 2, 3, 4, 5]);
assert.deepEqual(pageWindow(4, 6), [1, "...", 3, 4, 5, 6]);

// Never two ellipses in a row, and never an ellipsis at either end.
for (let total = 1; total <= 30; total++) {
  for (let page = 1; page <= total; page++) {
    const out = pageWindow(page, total);
    assert.notEqual(out[0], "...", `leading ellipsis at ${page}/${total}`);
    assert.notEqual(out[out.length - 1], "...", `trailing ellipsis at ${page}/${total}`);
    for (let i = 1; i < out.length; i++) {
      assert.ok(
        !(out[i] === "..." && out[i - 1] === "..."),
        `double ellipsis at ${page}/${total}`
      );
    }
    // Page numbers stay strictly ascending and in range.
    const nums = out.filter((v): v is number => typeof v === "number");
    assert.deepEqual(nums, [...nums].sort((a, b) => a - b));
    assert.equal(new Set(nums).size, nums.length, `duplicate page at ${page}/${total}`);
    assert.ok(nums.every((n) => n >= 1 && n <= total));
    assert.ok(nums.includes(page), `current page missing at ${page}/${total}`);
  }
}

console.log("pagination.check.ts: all assertions passed");
