/** Pack the local SDK and verify an independent offline consumer's registry and archive pins. */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {searchConsumerLock,verifySearchConsumerRegistry} from '../search-consumer-lock.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const collaboration = '@breditor/collaboration';

export function installCollaborationConsumer(root, directory) {
  const consumer = join(directory, 'consumer');
  const output = join(directory, 'archives');
  mkdirSync(consumer);
  mkdirSync(output);
  const npm = process.env.BREDITOR_NPM ?? 'npm';
  const names = ['@breditor/browser', '@breditor/experimental-rich-content', collaboration];
  const packs = JSON.parse(execFileSync(npm, [
    'pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', output,
    ...names.flatMap(name => ['--workspace', name]),
  ], {cwd: root, encoding: 'utf8'}));
  const archives = packs.map(pack => ({name: pack.name, path: join(output, pack.filename)}));
  const producer = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const locked = searchConsumerLock(producer, archives);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify(locked.manifest));
  writeFileSync(join(consumer, 'package-lock.json'), JSON.stringify(locked.lock));
  execFileSync(npm, ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: consumer, stdio: 'inherit',
  });
  const installedRoot = realpathSync(join(consumer, 'node_modules', collaboration));
  assert.ok(installedRoot.startsWith(realpathSync(consumer) + '/'));
  const registryArtifacts = verifySearchConsumerRegistry(
    producer, JSON.parse(readFileSync(join(consumer, 'package-lock.json'), 'utf8')),
  );
  return {
    distribution: join(installedRoot, 'dist'),
    rich: join(consumer, 'node_modules/@breditor/experimental-rich-content/index.js'),
    proof: {registryArtifacts, archives: archives.map(({name, path}) => ({name, sha256: sha(readFileSync(path))}))},
  };
}
