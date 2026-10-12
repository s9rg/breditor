import assert from "node:assert/strict";
import {mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {exactTree, hashBytes, verifyRetainedPair} from "./retained-nested-pair.mjs";

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "breditor-retained-pair-test-")));
  t.after(() => rm(root, {recursive: true, force: true}));
  const staging = join(root, "nested-list-packages-Test123");
  await mkdir(join(staging, "tarballs"), {recursive: true});
  const record = {status: "passed", publishable: false, staging, tarballSha256: {}};
  for (const name of ["browser", "wasm"]) {
    await mkdir(join(staging, name, "dist"), {recursive: true});
    await writeFile(join(staging, name, "package.json"), '{"private":true}');
    await writeFile(join(staging, name, "dist/index.js"), name);
    const bytes = Buffer.from(`fake ${name} archive`);
    const path = join(staging, "tarballs", `${name}.tgz`);
    await writeFile(path, bytes);
    record[`${name}Package`] = {path, bytes: bytes.length};
    record.tarballSha256[name] = hashBytes(bytes);
  }
  const path = join(staging, "qualification.json");
  await writeFile(path, JSON.stringify(record));
  return {root, staging, path, record};
}

test("verifies exact retained hashes without writing or requiring an old consumer", async t => {
  const {root, path, record} = await fixture(t);
  const bytes = await readFile(path);
  const result = await verifyRetainedPair(path, root);
  assert.deepEqual(result.record, record);
  assert.equal(result.reportSha256, hashBytes(bytes));
  assert.deepEqual(result.trees.browser.dist, {"index.js": hashBytes("browser")});
  assert.deepEqual(await readFile(path), bytes);
});

test("rejects archive mutation, wrong size and failed or publishable reports", async t => {
  const {root, path, record} = await fixture(t);
  const archive = record.browserPackage.path;
  const original = await readFile(archive);
  await writeFile(archive, "changed");
  await assert.rejects(verifyRetainedPair(path, root), /archive hash/u);
  await writeFile(archive, original);
  for (const changed of [
    {...record, status: "failed"},
    {...record, publishable: true},
    {...record, browserPackage: {...record.browserPackage, bytes: original.length + 1}},
    {...record, staging: root},
  ]) {
    await writeFile(path, JSON.stringify(changed));
    await assert.rejects(verifyRetainedPair(path, root));
  }
});

test("rejects linked archives, linked tree entries and wrong target boundaries", async t => {
  const {root, staging, path, record} = await fixture(t);
  await assert.rejects(verifyRetainedPair(path, staging));
  const archive = record.browserPackage.path;
  const original = await readFile(archive);
  const outside = join(root, "outside.tgz");
  await writeFile(outside, original);
  await rm(archive);
  await symlink(outside, archive);
  await assert.rejects(verifyRetainedPair(path, root), /strictly equal|linked/u);
  const tree = join(staging, "browser");
  await symlink(outside, join(tree, "linked.js"));
  await assert.rejects(exactTree(tree), /linked or special/u);
});
