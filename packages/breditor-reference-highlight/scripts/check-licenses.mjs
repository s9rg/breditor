import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = resolve(packageDirectory, "../..");

for (const name of ["LICENSE", "LICENSE-MIT", "LICENSE-APACHE"]) {
  const [canonical, packaged] = await Promise.all([
    readFile(join(repositoryRoot, name)),
    readFile(join(packageDirectory, name)),
  ]);
  assert.deepEqual(packaged, canonical, `${name} differs from the repository license`);
}
