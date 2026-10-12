// Read-only admission of retained private Breditor package pairs.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile, readdir, realpath} from "node:fs/promises";
import {basename, dirname, join, relative} from "node:path";

export const hashBytes = bytes => createHash("sha256").update(bytes).digest("hex");

export async function exactTree(path) {
  assert.equal(await realpath(path), path, "linked tree path");
  const result = {};
  for (const entry of (await readdir(path, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = join(path, entry.name);
    assert.ok(entry.isFile() || entry.isDirectory(), "linked or special tree entry");
    result[entry.name] = entry.isDirectory() ? await exactTree(child) : hashBytes(await readFile(child));
  }
  return result;
}

export async function verifyRetainedPair(path, target) {
  assert.equal(await realpath(target), target);
  assert.equal(await realpath(path), path);
  assert.match(relative(target, path), /^nested-list-packages-[a-zA-Z0-9]+\/qualification\.json$/u);
  const bytes = await readFile(path), record = JSON.parse(bytes);
  assert.equal(record.status, "passed");
  assert.equal(record.publishable, false);
  assert.equal(record.staging, dirname(path));
  const trees = {};
  const archives = {};
  for (const name of ["browser", "wasm"]) {
    const archive = record[`${name}Package`].path;
    assert.equal(archive, join(record.staging, "tarballs", basename(archive)));
    assert.equal(await realpath(archive), archive);
    const content = await readFile(archive);
    assert.equal(hashBytes(content), record.tarballSha256[name], `${name} archive hash`);
    assert.equal(content.length, record[`${name}Package`].bytes);
    archives[name] = archive;
    const stage = join(record.staging, name);
    trees[name] = await exactTree(stage);
    assert.equal(JSON.parse(await readFile(join(stage, "package.json"))).private, true);
  }
  return {record, reportSha256: hashBytes(bytes), trees, archives};
}
