import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";

/** Repo root for scripts started from compiled `dist/` or monorepo packages. */
export function resolveRepoRoot(fromModuleUrl: string): string {
  if (config.repoRoot?.trim()) return path.resolve(config.repoRoot.trim());
  return path.resolve(path.dirname(fileURLToPath(fromModuleUrl)), "../../..");
}
