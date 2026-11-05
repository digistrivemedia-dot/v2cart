/**
 * Page numbers to render in a pager: always first and last, plus a window
 * around the current page, with "..." wherever the run skips ahead.
 *
 * e.g. pageWindow(7, 12) -> [1, "...", 6, 7, 8, "...", 12]
 *
 * Self-check: `node --experimental-strip-types src/utils/pagination.check.ts`
 */
export function pageWindow(
  currentPage: number,
  totalPages: number,
  /** How many pages to show on each side of the current one. */
  radius = 1
): (number | "...")[] {
  const out: (number | "...")[] = [];

  for (let page = 1; page <= totalPages; page++) {
    const keep =
      page === 1 || page === totalPages || Math.abs(page - currentPage) <= radius;
    if (!keep) continue;

    const prev = out[out.length - 1];
    if (typeof prev === "number" && page - prev > 1) {
      out.push("...");
    }
    out.push(page);
  }

  return out;
}
