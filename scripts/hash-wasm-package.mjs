import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const directoryArgument = process.argv[2];
if (directoryArgument === undefined) {
  throw new Error("usage: hash-wasm-package.mjs <dist-directory>");
}

const directory = resolve(directoryArgument);
const entries = (await readdir(directory, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();
const hashes = [];

for (const name of entries) {
  const contents = await readFile(join(directory, name));
  hashes.push([name, createHash("sha256").update(contents).digest("hex")]);
}

process.stdout.write(`${JSON.stringify(hashes)}\n`);
