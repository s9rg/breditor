/** Qualify cold inspection and approved repair with a source build or independent installation. */
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync} from 'node:fs';
import {homedir, tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {saveEvidence, sourceEvidence} from './candidate-release/evidence.mjs';
import {executeCandidateStage} from './candidate-release/process.mjs';
import {freezeRelaySources} from './sealed-room-cli-qualification/inputs.mjs';
import {cargoExecutables, pinExecutable, runCliFixtures} from './sealed-room-cli-qualification/runner.mjs';

const args = process.argv.slice(2);
if (args.length !== 1 || !['--source', '--installed'].includes(args[0])) {
  throw Error('Use check-sealed-room-cli.mjs --source or --installed');
}
const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const target = join(root, 'target');
const evidenceParent = join(target, 'v1-candidate-runs');
const localCargo = join(homedir(), '.cargo/bin/cargo');
const cargo = process.env.BREDITOR_CARGO ?? process.env.CARGO_BIN ?? (existsSync(localCargo) ? localCargo : 'cargo');
const sourceReport = join(target, 'sealed-room-cli-source.json');
const relayManifest = 'experiments/relay/Cargo.toml';
const installed = args[0] === '--installed';
const source = sourceEvidence(root);
mkdirSync(evidenceParent, {recursive: true});
const evidence = mkdtempSync(join(evidenceParent, installed ? 'sealed-cli-installed-' : 'sealed-cli-source-'));
const controller = new AbortController();
const stop = () => controller.abort();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

async function runCargo(id, cargoArgs, directory, cargoTarget) {
  const log = join(evidence, id + '.log');
  const result = await executeCandidateStage({
    id, command: cargo, args: cargoArgs,
    env: {CARGO_TARGET_DIR: cargoTarget, CARGO_INCREMENTAL: '0', CARGO_PROFILE_RELEASE_DEBUG: '0'},
    timeoutMs: 1500000,
  }, {root: directory, logPath: log, signal: controller.signal});
  assert.equal(result.status, 'passed', log);
  return log;
}

function retainReport(path, result) {
  saveEvidence(join(evidence, 'result.json'), result);
  saveEvidence(path, result);
}

async function testSource() {
  const buildTarget = resolve(root, process.env.CARGO_TARGET_DIR ?? 'target/owned-history-relay-native');
  const build = await runCargo('sealed-cli-source-build', [
    'test', '--manifest-path', relayManifest, '--features', 'server', '--release',
    '--locked', '--offline', '--test', 'sealed_inspection_cli', '--no-run', '--message-format=json',
  ], root, buildTarget);
  const selected = cargoExecutables(build);
  const binary = await pinExecutable(buildTarget, selected.binary);
  const harness = await pinExecutable(buildTarget, selected.harness);
  const tests = await runCliFixtures(harness, binary, {
    cwd: root, log: join(evidence, 'source-tests.log'), signal: controller.signal,
  });
  assert.deepEqual(await pinExecutable(buildTarget, binary.path), binary);
  assert.deepEqual(await pinExecutable(buildTarget, harness.path), harness);
  assert.deepEqual(sourceEvidence(root), source);
  retainReport(sourceReport, {
    format: 'breditor/sealed-room-cli-source', formatVersion: 1, source,
    passed: true, buildTarget: realpathSync(buildTarget), build, binary, harness, tests,
  });
  console.log('sealed room CLI source tests passed; report ' + sourceReport);
}

async function testInstalled() {
  const prior = JSON.parse(readFileSync(sourceReport, 'utf8'));
  assert.equal(prior.format, 'breditor/sealed-room-cli-source');
  assert.equal(prior.formatVersion, 1);
  assert.equal(prior.passed, true);
  assert.deepEqual(prior.source, source, 'Run the source stage for this exact candidate first');
  assert.deepEqual(await pinExecutable(prior.buildTarget, prior.harness.path), prior.harness);
  assert.deepEqual(await pinExecutable(prior.buildTarget, prior.binary.path), prior.binary);
  const work = mkdtempSync(join(realpathSync(tmpdir()), 'breditor-sealed-cli-install-'));
  try {
    const snapshot = join(work, 'source');
    mkdirSync(snapshot);
    const frozen = freezeRelaySources(root, snapshot);
    const buildTarget = resolve(root, process.env.BREDITOR_SEALED_ROOM_CLI_CONSUMER_TARGET ?? join(work, 'target'));
    mkdirSync(buildTarget, {recursive: true});
    assert.notEqual(realpathSync(buildTarget), prior.buildTarget, 'Installed builds use a separate Cargo target');
    const prefix = join(evidence, 'installed');
    const install = await runCargo('sealed-cli-cargo-install', [
      'install', '--path', join(snapshot, 'experiments/relay'), '--root', prefix,
      '--locked', '--offline', '--features', 'server', '--bin', 'breditor-collab-relay',
    ], snapshot, buildTarget);
    const binary = await pinExecutable(prefix, join(prefix, 'bin', 'breditor-collab-relay'));
    const tests = await runCliFixtures(prior.harness, binary, {
      cwd: work, log: join(evidence, 'installed-tests.log'), signal: controller.signal,
    });
    assert.deepEqual(await pinExecutable(prefix, binary.path), binary);
    assert.deepEqual(await pinExecutable(prior.buildTarget, prior.harness.path), prior.harness);
    assert.deepEqual(await pinExecutable(prior.buildTarget, prior.binary.path), prior.binary);
    assert.deepEqual(sourceEvidence(root), source);
    const report = join(target, 'sealed-room-cli-installed.json');
    retainReport(report, {
      format: 'breditor/sealed-room-cli-installed', formatVersion: 1, source, passed: true,
      frozen, sourceHarness: prior.harness, install, binary, tests,
    });
    console.log('sealed room CLI installed tests passed; report ' + report);
  } finally {
    rmSync(work, {recursive: true, force: true});
  }
}

try {
  if (installed) await testInstalled();
  else await testSource();
} finally {
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}
