/** Freeze the relay and its exact local dependencies for an independent Cargo install. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants, copyFileSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileEvidence} from '../candidate-release/evidence.mjs';

const relaySources = [
  'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml',
  'crates/breditor-core', 'crates/breditor-wasm', 'crates/breditor-collaboration',
  'experiments/collaboration', 'experiments/relay',
];

export function freezeRelaySources(root, snapshot) {
  const listed = execFileSync('git', [
    'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...relaySources,
  ], {cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
  const paths = [...new Set(listed.split('\0').filter(Boolean))].sort();
  for (const required of ['experiments/relay/Cargo.toml', 'experiments/relay/Cargo.lock', 'rust-toolchain.toml']) {
    assert.ok(paths.includes(required), required);
  }
  const inventory = createHash('sha256');
  let bytes = 0;
  for (const path of paths) {
    const {sha256, bytes: size} = fileEvidence(root, path);
    const destination = join(snapshot, path);
    mkdirSync(dirname(destination), {recursive: true});
    copyFileSync(join(root, path), destination, constants.COPYFILE_FICLONE);
    const frozen = fileEvidence(snapshot, path);
    assert.equal(frozen.bytes, size, path);
    assert.equal(frozen.sha256, sha256, path);
    inventory.update(JSON.stringify([path, size, sha256]) + '\n');
    bytes += size;
  }
  return {files: paths.length, bytes, inventorySha256: inventory.digest('hex')};
}
