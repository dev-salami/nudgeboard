export function parseFlags(args: string[]): Record<string, string | boolean>;
export function runSmoke(args: string[], dependencies?: {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
}): Promise<void>;
