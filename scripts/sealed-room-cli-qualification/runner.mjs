/** Pin the exact executable used by every fixture and require all six terminal cases. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream, lstatSync, readFileSync, realpathSync} from 'node:fs';
import {isAbsolute, relative, resolve} from 'node:path';
import {executeCandidateStage} from '../candidate-release/process.mjs';

const expectedCases = [
  'cli_retains_complete_cut_and_refuses_unsafe_destinations',
  'cli_retains_descendant_cut_and_both_exact_interrupted_writes',
  'cli_retains_rotation_and_exact_pending_raster_evidence',
  'repair::repair_cli_applies_native_tail_raster_and_combined_modes',
  'repair::repair_cli_refuses_changed_evidence_and_unapproved_paths',
  'repair::repair_cli_completes_rotation_and_retains_the_actual_selected_head',
].sort();

export async function pinExecutable(directory, path) {
  const full = resolve(path);
  const selected = realpathSync(full);
  const part = relative(realpathSync(directory), selected);
  assert.ok(!isAbsolute(part) && part && part !== '..' && !part.startsWith('../'));
  assert.ok(lstatSync(full).isFile(), 'Relay executable must be a direct file');
  const stat = lstatSync(selected);
  assert.ok(stat.isFile() && stat.size > 0 && (stat.mode & 0o111) !== 0);
  const digest = createHash('sha256');
  let bytes = 0;
  for await (const block of createReadStream(selected, {end: stat.size})) {
    bytes += block.length;
    digest.update(block);
  }
  const after = lstatSync(selected);
  assert.equal(bytes, stat.size);
  assert.deepEqual([after.dev, after.ino, after.size, after.mtimeMs],
    [stat.dev, stat.ino, stat.size, stat.mtimeMs]);
  return {path: selected, bytes, sha256: digest.digest('hex')};
}

export function cargoExecutables(log) {
  const messages = readFileSync(log, 'utf8').split('\n')
    .filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  const artifacts = messages.filter(row => row.reason === 'compiler-artifact' && row.executable);
  const one = (kind, name) => {
    const found = artifacts.filter(row => row.target.name === name && row.target.kind.includes(kind));
    assert.equal(found.length, 1, name);
    return found[0].executable;
  };
  return {harness: one('test', 'sealed_inspection_cli'), binary: one('bin', 'breditor-collab-relay')};
}

export async function runCliFixtures(harness, binary, {cwd, log, signal}) {
  const execution = await executeCandidateStage({
    id: 'sealed-room-cli-fixtures',
    command: harness.path,
    args: ['--test-threads=2'],
    env: {BREDITOR_INSTALLED_INSPECTION_RELAY: binary.path},
    timeoutMs: 180000,
  }, {root: cwd, logPath: log, signal});
  assert.equal(execution.status, 'passed', log);
  const output = readFileSync(log, 'utf8');
  assert.match(output, /^test result: ok\. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out;/m);
  const cases = [...output.matchAll(/^test (\S+) \.\.\. ok$/gm)].map(match => match[1]).sort();
  assert.deepEqual(cases, expectedCases);
  return {cases, log, logSha256: createHash('sha256').update(output).digest('hex')};
}
