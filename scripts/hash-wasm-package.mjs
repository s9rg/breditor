import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const directoryArgument = process.argv[2];
if (directoryArgument === undefined) {
  throw new Error("usage: hash-wasm-package.mjs <dist-directory>");
}

const directory = resolve(directoryArgument);
const entries = (await listFiles(directory)).sort();
const hashes = [];

for (const name of entries) {
  const contents = await readFile(join(directory, name));
  hashes.push([name, createHash("sha256").update(contents).digest("hex")]);
}

process.stdout.write(`${JSON.stringify(hashes)}\n`);

async function listFiles(root, relativeDirectory = "") {
  const absoluteDirectory = join(root, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error(`unexpected non-file package entry: ${relativePath}`);
    }
  }
  return files;
}
