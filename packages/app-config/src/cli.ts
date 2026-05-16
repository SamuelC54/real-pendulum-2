/** Read `--flag value` from `process.argv` (E2E child processes; defaults live in `config`). */

export function cliPort(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  if (i < 0 || !process.argv[i + 1]) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function cliString(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0 || !process.argv[i + 1]) return undefined;
  const v = process.argv[i + 1].trim();
  return v || undefined;
}
