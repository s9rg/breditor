/** Canonical shared source must compile against the same pinned history-staging API in every owner. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const cargo=process.env.BREDITOR_CARGO??process.env.CARGO_BIN??resolve(homedir(),'.cargo/bin/cargo');
const rustc=process.env.BREDITOR_RUSTC??process.env.RUSTC_BIN??process.env.RUSTC??resolve(homedir(),'.cargo/bin/rustc');
const host=execFileSync(rustc,['-vV'],{encoding:'utf8'}).match(/^host: (\S+)$/m)?.[1];assert.ok(host);
for(const manifest of ['crates/breditor-collaboration/Cargo.toml','experiments/collaboration/Cargo.toml','experiments/relay/Cargo.toml']){
 test(`${manifest} resolves the exact pinned native history-staging implementation without registry substitution`,()=>{
  const metadata=JSON.parse(execFileSync(cargo,['metadata','--manifest-path',manifest,'--locked','--offline','--filter-platform',host,'--format-version','1'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}));
  for(const name of ['loro','loro-internal']){
   const packages=metadata.packages.filter(p=>p.name===name);assert.equal(packages.length,1,`${manifest}: duplicate ${name}`);
   const p=packages[0];assert.equal(p.version,'1.16.2');assert.equal(p.source,null);
   assert.equal(realpathSync(p.manifest_path),realpathSync(resolve(root,`crates/breditor-collaboration/vendor/${name}-1.16.2/Cargo.toml`)));
  }
  const owner=metadata.packages.find(p=>p.name===(manifest.startsWith('crates/')?'breditor-collaboration':'breditor-collab-feasibility'));assert.ok(owner);
  assert.equal(realpathSync(owner.targets.find(t=>t.kind.includes('rlib')).src_path),realpathSync(resolve(root,'crates/breditor-collaboration/src/lib.rs')));
 });
}
test('the research compatibility owner retains explicit direct path edges at the original pinned version',()=>{
 const manifest=readFileSync(resolve(root,'experiments/collaboration/Cargo.toml'),'utf8');
 for(const name of ['loro','loro-internal'])assert.match(manifest,new RegExp(`^${name} = \\{ version = "=1\\.16\\.2", path = "\\.\\./\\.\\./crates/breditor-collaboration/vendor/${name}-1\\.16\\.2", default-features = false \\}$`,'m'));
});
