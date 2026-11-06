import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  // Tests never inherit credentials or reach a payment, mail, or model service.
  for (const name of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "PAYPAL_MODE", "PAYPAL_ENVIRONMENT", "LLM_API_KEY", "PAYLINK_DEMO_MODE", "RESEND_API_KEY", "APP_URL"]) {
    vi.stubEnv(name, "");
  }
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unmocked network request blocked by test setup."); }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
