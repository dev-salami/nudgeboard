import { fromAtomic, toAtomic } from "@181hacks/paylink-core";

/** PayPal invoice amounts are decimal strings with two fraction digits. */
export function paypalAmount(amount: string): string {
  const atomic = toAtomic(amount, 2);
  if (atomic <= 0n) throw new Error("Amount must be greater than zero.");
  const text = fromAtomic(atomic, 2);
  const [whole, frac = ""] = text.split(".");
  return `${whole}.${(frac + "00").slice(0, 2)}`;
}

export function formatUsd(amount: string | number): string {
  const raw = typeof amount === "number" ? amount.toFixed(2) : amount.trim() || "0";
  const atomic = toAtomic(raw, 2);
  const text = fromAtomic(atomic < 0n ? 0n : atomic, 2);
  const [whole, frac = ""] = text.split(".");
  const withCommas = (whole ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${withCommas}.${(frac + "00").slice(0, 2)}`;
}

export function compareUsd(left: string, right: string): -1 | 0 | 1 {
  const a = toAtomic(left, 2);
  const b = toAtomic(right, 2);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
