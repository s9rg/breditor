/** Repeat the same source assertions with fresh offline public package archives. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {fileEvidence,sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root);
assert.equal(source.dirty,false,'Qualify a clean source checkpoint');
const [mode,input]=process.argv.slice(2);
assert.ok((mode==='source'||mode==='installed')&&process.argv.length<=4,
 'Supply source or installed, optionally with a retained native server-generation inventory manifest');
const native=input===undefined?JSON.parse(readFileSync(join(root,'target/server-generation-inventory-native.json'),'utf8')):undefined;
const manifestPath=resolve(input??native.manifest);
if(native){
 assert.equal(native.format,'breditor/native-server-generation-inventory-check');
 assert.equal(native.passed,true);
 assert.deepEqual(native.source,source);
 const retained=fileEvidence(root,relative(root,manifestPath));
 assert.deepEqual(retained,native.manifestEvidence);
}
const manifestBytes=readFileSync(manifestPath),manifest=JSON.parse(manifestBytes);
assert.equal(manifest.format,'breditor/native-server-generation-inventory-fixtures');
assert.equal(manifest.cases.length,10);
const chosen=[];
for(const language of [1,2,3])for(const atomic of [false,true]){
 const fixture=manifest.cases.map(row=>JSON.parse(readFileSync(row.path,'utf8')));
 const index=fixture.findIndex(row=>row.language===language&&row.atomic===atomic&&!row.longNativeCut);
 assert.ok(index>=0);
 const row=manifest.cases[index];
 assert.equal(row.nativeOwnerAuthenticated,true);
 assert.equal(row.nativeColdOperationalReopenVerified,true);
 chosen.push({path:row.path,language,atomic});
}
const node=process.execPath,npm=process.env.BREDITOR_NPM??process.env.NPM_BIN??'npm';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const name='probe-continued-room-catalog.mjs',sourceProbe=join(root,'scripts',name);
let cwd=root,runtime=join(root,'target/promoted-shared-web'),probe=sourceProbe,consumerProof=null;
if(mode==='installed'){
 const temporary=mkdtempSync(join(tmpdir(),'breditor-continued-room-installed-'));
 const archives=join(temporary,'archives'),consumer=join(temporary,'consumer');
 mkdirSync(archives);mkdirSync(consumer);
 const names=['@breditor/browser','@breditor/experimental-rich-content','@breditor/collaboration'];
 const packs=JSON.parse(execFileSync(npm,['pack','--offline','--ignore-scripts','--json','--pack-destination',archives,
  ...names.flatMap(name=>['--workspace',name])],{cwd:root,encoding:'utf8'}));
 const entries=packs.map(pack=>({name:pack.name,path:join(archives,pack.filename)}));
 const producer=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8')),locked=searchConsumerLock(producer,entries);
 writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));
 writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));
 execFileSync(npm,['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
 const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(readFileSync(join(consumer,'package-lock.json'),'utf8')));
 for(const name of names)assert.ok(realpathSync(join(consumer,'node_modules',name)).startsWith(realpathSync(consumer)+'/node_modules/'));
 for(const path of ['room-participant-inventory/environment.mjs','review-assets/pixels.mjs','interchange-consumer/pixel.mjs','independent-delivery/session.mjs','owned-core-cleanup/session.mjs']){
  const output=join(consumer,'fixtures',path);mkdirSync(dirname(output),{recursive:true});
  cpSync(join(root,'scripts','fixtures',path),output);
 }
 const from="'../packages/breditor-collaboration/dist/index.js'",to="'@breditor/collaboration'";
 const original=readFileSync(sourceProbe,'utf8'),installed=original.replace(from,to);
 assert.notEqual(original,installed);
 assert.equal(installed.replace(to,from),original);
 probe=join(consumer,name);writeFileSync(probe,installed);
 const typeFile='types-continued-room-catalog.ts';
 cpSync(join(root,'scripts/fixtures/editor-consumer',typeFile),join(consumer,typeFile));
 execFileSync(node,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes',
  '--target','ES2022','--module','NodeNext','--lib','ES2022,DOM,ESNext.Disposable',typeFile],{cwd:consumer,stdio:'inherit'});
 const entry=join(consumer,'entry.mjs');
 writeFileSync(entry,'export {SharedContinuedRoomCatalog,SharedContinuedRoomCatalogStore,beginContinuedRoomRecovery,resumeContinuedRoomRecovery} from "@breditor/collaboration";');
 const output=await build({configFile:false,root:consumer,logLevel:'error',
  build:{target:'es2022',write:false,minify:false,lib:{entry,formats:['es'],fileName:'continued-room-catalog'}}});
 const modules=(Array.isArray(output)?output:[output]).flatMap(result=>result.output)
  .filter(item=>item.type==='chunk').flatMap(item=>Object.keys(item.modules));
 for(const path of ['continued_room_catalog/archive.js','continued_room_catalog/storage.js','continued_participant/inventory.js','continued_room_recovery/recovery.js','continued_room_recovery/independent_destination.js','continued_room_recovery/delivery_destination.js'])
  assert.ok(modules.some(module=>module.includes('/node_modules/@breditor/collaboration/dist/'+path)),path);
 assert.ok(!modules.some(module=>module.includes(join(root,'packages'))||module.includes('fake-indexeddb')));
 cwd=consumer;runtime=join(consumer,'node_modules/@breditor/collaboration/dist/runtime');
 consumerProof={consumer,workspaceLinks:false,strictPublicTypes:true,registryArtifacts,moduleCount:modules.length,
  archives:entries.map(row=>({...row,sha256:sha(readFileSync(row.path))}))};
}
const reports=chosen.map(row=>({...row,...JSON.parse(execFileSync(node,[probe,runtime,row.path],{
 cwd,encoding:'utf8',timeout:60000,maxBuffer:256*1024,
}))}));
const sharedWasmSha256=sha(readFileSync(join(root,'target/promoted-shared-web/breditor_shared_bg.wasm')));
for(const result of reports){
 assert.equal(result.passed,true);
 assert.equal(result.sharedWasmSha256,sharedWasmSha256);
 assert.equal(result.fixtureSha256,sha(readFileSync(result.path)));
 assert.equal(result.mixedRecoveryResumes,4);
 assert.equal(result.deliveryRecoveryResumes,2);
 assert.equal(result.occupiedBootstrapRefusals,2);
 assert.equal(result.disappearedBootstrapRefusals,1);
}
assert.deepEqual(sourceEvidence(root),source);
assert.deepEqual(readFileSync(manifestPath),manifestBytes);
const report={format:'breditor/continued-room-catalog-qualification',formatVersion:1,passed:true,mode,source,
 nativeFixtureManifest:{path:manifestPath,sha256:sha(manifestBytes)},sharedWasmSha256,reports,consumerProof};
saveEvidence(join(root,'target',`qualified-continued-room-catalog-${mode}.json`),report);
console.log(JSON.stringify(report,null,2));
