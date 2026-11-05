export function splitName(full: string): { given_name: string; surname: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  const given = parts[0] ?? "Client";
  const surname = parts.length > 1 ? parts.slice(1).join(" ") : "Payer";
  return { given_name: given, surname };
}

export function paypalInvoiceId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `DEMO-INV2-${hex}`;
}
