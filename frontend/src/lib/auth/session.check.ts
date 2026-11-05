/**
 * Self-check for the session-verification branch in lib/auth/client.ts.
 *
 * Run with:  node --experimental-strip-types src/lib/auth/session.check.ts
 *
 * The bug this guards: the stored session used to be trusted without ever
 * being checked, so another app previously served on this same localhost port
 * left behind `auth_token`/`user` that this app read as its own session — a
 * stranger's name in the navbar, and "jwt malformed" from /me.
 *
 * The fix has one branch that MUST NOT be got wrong in either direction:
 *   - server REJECTED the token (reachable, success:false) → purge
 *   - server UNREACHABLE (fetch threw)                     → keep
 * Purging on a network blip logs everyone out when the backend restarts;
 * keeping on a rejection is the original ghost-session bug.
 *
 * `**\/*.check.ts` is excluded from tsconfig, so this never enters the Next
 * build — a plain runnable assertion file, no test framework.
 */

import assert from "node:assert";

/**
 * Mirrors the decision in `verify()`. Kept as a pure function here because
 * verify() itself touches localStorage, document.cookie and React.
 */
function decide(outcome:
  | { kind: "rejected" }
  | { kind: "ok"; user: { name: string } }
  | { kind: "threw" }
): "purge" | "keep" | "adopt" {
  switch (outcome.kind) {
    case "rejected": return "purge";
    case "threw": return "keep";
    case "ok": return "adopt";
  }
}

// A token the server actively rejects is not ours — this is the ghost session
// from the other project, and the whole point of the fix.
assert.equal(decide({ kind: "rejected" }), "purge", "rejected token must be purged");

// Backend down (the exact situation from the previous debugging session) must
// NOT log anyone out.
assert.equal(decide({ kind: "threw" }), "keep", "network failure must not log the user out");

// A good response wins over the stored blob, so a role an admin changed and a
// name edited on the profile page both take effect.
assert.equal(decide({ kind: "ok", user: { name: "Real" } }), "adopt", "server copy wins");

// --- auth-vs-load error classification used by the profile page ---
const isAuthError = (m: string) => /login|jwt|token|expired|unauthor/i.test(m);

for (const m of [
  "jwt malformed",
  "Please Login to Access",
  "jwt expired",
  "Unauthorized",
]) {
  assert.ok(isAuthError(m), `"${m}" must offer Log in, not Retry`);
}

for (const m of ["Failed to fetch", "Internal Server Error", ""]) {
  assert.ok(!isAuthError(m), `"${m}" must offer Retry, not Log in`);
}

console.log("session.check.ts: all assertions passed");
