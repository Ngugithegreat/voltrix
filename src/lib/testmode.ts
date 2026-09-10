// Test-mode whitelist. A comma-separated TEST_EMAILS env var enables a QA
// harness (force a trade's win/lose outcome) for ONLY those accounts. Empty /
// unset = the feature is completely inert, so it's off by default in production.
// Clear TEST_EMAILS in Vercel before real launch.
export function isTestEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.TEST_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(String(email).trim().toLowerCase());
}
