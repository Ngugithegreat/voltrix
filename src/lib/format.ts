// All money values in the app are integer cents.

export function cents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function toDollars(c: number): number {
  return c / 100;
}

export function money(c: number, opts: { sign?: boolean } = {}): string {
  const v = c / 100;
  const s = v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (opts.sign && c > 0) return "+" + s;
  return s;
}

/** Public-facing account number derived from the user id, e.g. NT-100482. */
export function accountNo(id: number): string {
  return "NT-" + String(100000 + Number(id));
}

/** Parse an account number / referral code (NT-100482 or NT100482) back to a user id. */
export function idFromAccountNo(code: string): number | null {
  const m = String(code).trim().toUpperCase().match(/^NT-?(\d{5,})$/);
  if (!m) return null;
  const id = Number(m[1]) - 100000;
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function shortTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
