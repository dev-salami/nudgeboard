import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvFile(file: string) {
  try {
    const text = readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // The root env file is optional. The app also reads apps/paylink-paypal/.env*.
  }
}

loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.local"));

const nextConfig: NextConfig = {
  transpilePackages: ["@181hacks/paylink-core"],
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  eslint: { dirs: ["app", "components", "lib"] },
  devIndicators: false,
};

export default nextConfig;
