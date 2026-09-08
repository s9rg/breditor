import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageDirectories = [
  join(repositoryRoot, "packages", "breditor-browser"),
  join(repositoryRoot, "packages", "breditor-reference-highlight"),
  join(repositoryRoot, "packages", "breditor-wasm"),
];

for (const name of ["LICENSE", "LICENSE-MIT", "LICENSE-APACHE"]) {
  const canonical = await readFile(join(repositoryRoot, name));
  for (const packageDirectory of packageDirectories) {
    const packaged = await readFile(join(packageDirectory, name));
    assert.deepEqual(
      packaged,
      canonical,
      `${join(packageDirectory, name)} differs from the repository license`,
    );
  }
}
