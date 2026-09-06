import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allowedPackageDirectories = new Set([
  join(repositoryRoot, "packages", "breditor-browser"),
  join(repositoryRoot, "packages", "breditor-wasm"),
]);
const packageDirectory = resolve(process.cwd());

if (!allowedPackageDirectories.has(packageDirectory)) {
  throw new Error(`refusing to clean an unexpected package directory: ${packageDirectory}`);
}

await rm(join(packageDirectory, "dist"), { recursive: true, force: true });
