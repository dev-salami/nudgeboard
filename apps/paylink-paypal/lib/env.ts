export function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export type PaypalMode = "demo" | "sandbox";

/** True only when both REST credentials are present. Empty values stay in demo mode. */
export function paypalConfigured(): boolean {
  return Boolean(env("PAYPAL_CLIENT_ID") && env("PAYPAL_CLIENT_SECRET"));
}

export function paypalMode(): PaypalMode {
  if (env("PAYPAL_MODE") === "demo") return "demo";
  return paypalConfigured() ? "sandbox" : "demo";
}

export function paypalEnvironment(): "sandbox" {
  if (env("PAYPAL_ENVIRONMENT", "sandbox") !== "sandbox") {
    throw new Error("Only PayPal sandbox is supported. Set PAYPAL_ENVIRONMENT=sandbox.");
  }
  return "sandbox";
}

export function paypalApiBase(): string {
  paypalEnvironment();
  return "https://api-m.sandbox.paypal.com";
}

export function appOrigin(request?: Request): string {
  const configured = env("APP_URL");
  if (configured) return configured.replace(/\/$/, "");
  if (request) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (host) {
      const forwarded = request.headers.get("x-forwarded-proto");
      const proto = forwarded || new URL(request.url).protocol.replace(":", "") || "http";
      return `${proto}://${host}`;
    }
    return new URL(request.url).origin;
  }
  return `http://localhost:${process.env.PORT || 3030}`;
}

export function demoMode(): boolean {
  const flag = env("PAYLINK_DEMO_MODE");
  if (flag === "0") return false;
  if (flag === "1" || flag === "true") return true;
  return !env("LLM_API_KEY");
}

export function merchantProfile() {
  return {
    name: env("MERCHANT_NAME", "Amaka Studio"),
    city: env("MERCHANT_CITY", "Lagos"),
    email: env("PAYPAL_MERCHANT_EMAIL") || env("MERCHANT_EMAIL", "amaka@amaka.studio"),
  };
}

export function dataDir(): string {
  return env("DATA_DIR") || "";
}
