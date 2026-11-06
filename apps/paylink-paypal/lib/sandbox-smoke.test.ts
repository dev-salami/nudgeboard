import { describe, expect, it, vi } from "vitest";
import { runSmoke } from "../scripts/sandbox-smoke.mjs";

const env = { PAYPAL_CLIENT_ID: "fake-smoke-id", PAYPAL_CLIENT_SECRET: "fake-smoke-secret" };
const draftFlags = ["--create-draft", "--recipient-email", "buyer@example.test", "--merchant-email", "merchant@example.test"];

function fixture() {
  const fetchImpl = vi.fn<typeof fetch>(async (url) => {
    expect(String(url)).toMatch(/^https:\/\/api-m\.sandbox\.paypal\.com\//);
    if (String(url).endsWith("/token")) return Response.json({ access_token: "fake-smoke-token", expires_in: 300 });
    if (String(url).includes("?page=")) return Response.json({ items: [{ id: "private-invoice-id", recipient: "private@example.test" }] });
    if (String(url).endsWith("/send")) return new Response(null, { status: 202 });
    return Response.json({ id: "INV2-SMOKE" }, { status: 201 });
  });
  return { fetchImpl, log: vi.fn<(message: string) => void>(), env };
}

describe("explicitly gated sandbox smoke script", () => {
  it("defaults to OAuth and account-scoped read-only invoice listing; prints no secrets or PII", async () => {
    const deps = fixture();
    await runSmoke([], deps);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(2);
    expect(deps.fetchImpl.mock.calls[1]?.[1]?.method).toBe("GET");
    const output = deps.log.mock.calls.flat().join(" ");
    for (const value of [env.PAYPAL_CLIENT_ID, env.PAYPAL_CLIENT_SECRET, "fake-smoke-token", "private-invoice-id", "private@example.test"]) expect(output).not.toContain(value);
    expect(output).toContain("No invoice mutations");
  });

  it("creates only a draft when explicitly requested; never implicitly sends", async () => {
    const deps = fixture();
    await runSmoke(draftFlags, deps);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(3);
    expect(deps.fetchImpl.mock.calls.some(([url]) => String(url).endsWith("/send"))).toBe(false);
    expect(deps.log.mock.calls.flat().join(" ")).toContain("NOT sent");
  });

  it("rejects incomplete send permission before authentication", async () => {
    const deps = fixture();
    for (const flags of [["--send"], [...draftFlags, "--send"], ["--create-draft"], ["--unknown"]]) {
      await expect(runSmoke(flags, deps)).rejects.toThrow();
    }
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it("sends only when all explicit mutation and confirmation flags are present", async () => {
    const deps = fixture();
    await runSmoke([...draftFlags, "--send", "--confirm-sandbox-send"], deps);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(4);
    expect(String(deps.fetchImpl.mock.calls[3]?.[0])).toContain("/INV2-SMOKE/send");
  });

  it("rejects live configuration and missing credentials without network", async () => {
    const deps = fixture();
    await expect(runSmoke([], { ...deps, env: { ...env, PAYPAL_ENVIRONMENT: "live" } })).rejects.toThrow(/sandbox/);
    await expect(runSmoke([], { ...deps, env: {} })).rejects.toThrow(/Export sandbox/);
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });
});
