/** Fresh actual native physical cuts, original protected records and inactive authenticated hosts. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,statSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,fileEvidence,saveEvidence} from './candidate-release/evidence.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function buildServerGenerationInventoryFixtures({saveReport=true}={}) {
 const source=sourceEvidence(root),cargo=process.env.BREDITOR_CARGO??process.env.CARGO_BIN??resolve(homedir(),'.cargo/bin/cargo'),env={...process.env,CARGO_TARGET_DIR:resolve(root,'target/owned-history-relay-native')};
 execFileSync(cargo,['build','--manifest-path','experiments/relay/Cargo.toml','--features','server','--locked','--offline','--release','--example','server_generation_inventory_fixture'],{cwd:root,env,stdio:'inherit'});
 const directory=mkdtempSync(resolve(root,'target/native-server-generation-inventory-')),binary=resolve(env.CARGO_TARGET_DIR,'release/examples/server_generation_inventory_fixture'),manifest=JSON.parse(execFileSync(binary,[directory],{cwd:root,env,encoding:'utf8',maxBuffer:1024*1024,timeout:600000}));
 assert.equal(manifest.format,'breditor/native-server-generation-inventory-fixtures');assert.equal(manifest.formatVersion,1);assert.equal(manifest.cases.length,10);
 for(const value of Object.values(manifest.archiveLimits))assert.ok(Number.isSafeInteger(value)&&value>0);
 const files=[];let longNativeCuts=0;
 for(const row of manifest.cases){for(const key of ['nativeOwnerAuthenticated','nativeProtectedStreamsVerified','nativeColdOperationalReopenVerified','nativePhysicalOnlyStalenessVerified'])assert.equal(row[key],true,key);assert.equal(row.rawCredentialsExported,false);assert.equal(dirname(dirname(resolve(row.path))),directory);
  const fixture=JSON.parse(readFileSync(row.path,'utf8'));assert.equal(fixture.format,'breditor/native-server-generation-inventory-fixture');assert.equal(fixture.clients.length,2);assert.deepEqual(fixture.selected.source.source,fixture.afterSelected.source.source);assert.notDeepEqual(fixture.selected.source.manifest,fixture.afterSelected.source.manifest);assert.notDeepEqual(fixture.selected.source.archiveSha256,fixture.afterSelected.source.archiveSha256);
  if(row.longNativeCut){longNativeCuts++;assert.ok(fixture.selected.source.source.records>8192);}
  for(const name of ['fixture.json','inventory.json','inventory-after.json','server.backup','server-after.backup']){const path=resolve(dirname(row.path),name);if(process.platform!=='win32'){assert.equal(statSync(dirname(path)).mode&0o777,0o700);assert.equal(statSync(path).mode&0o777,0o600);}files.push(fileEvidence(root,path.slice(root.length+1)));}
 }
 assert.equal(longNativeCuts,1);assert.throws(()=>execFileSync(binary,[directory],{cwd:root,env,encoding:'utf8',stdio:'pipe'}),error=>error.status!==0&&String(error.stderr).includes('AlreadyExists'));
 for(const file of files)assert.deepEqual(fileEvidence(root,file.path),file);assert.deepEqual(sourceEvidence(root),source);
 const manifestPath=resolve(directory,'fixtures.json');saveEvidence(manifestPath,manifest);
 const result={format:'breditor/native-server-generation-inventory-check',formatVersion:1,passed:true,source,manifest:manifestPath,manifestEvidence:fileEvidence(root,manifestPath.slice(root.length+1)),archiveLimits:manifest.archiveLimits,cases:10,longNativeCuts,physicalOnlyCuts:10,protectedStreams:40,rawCredentialsExported:false,files,scope:'Actual native physical histories and joined rasters, restored/continued inactive hosts, fresh owner auth and all four protected document/review streams per case. New physical-only cuts invalidate old current selections even with identical native cuts. One source exceeds 8192 actual records. No native/client replay reset, browser/platform qualification, provider closure or activation.'};
 if(saveReport)saveEvidence(resolve(root,'target/server-generation-inventory-native.json'),result);return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==2)throw Error('No arguments expected');console.log(JSON.stringify(buildServerGenerationInventoryFixtures(),null,2));}
