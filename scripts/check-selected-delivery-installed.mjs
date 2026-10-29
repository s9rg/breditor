/** Complete ten-mode public workflow from fresh actual package archives AND
 * execution of their minified production SDK. No workspace-linked SDK code. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,realpathSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {build} from 'vite';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
import {NORMAL_SHARED_WASM_SHA256} from './fixtures/native-runtime/normal-shared-identity.mjs';
if(process.argv.length!==2)throw Error('No reduced or substituted qualification accepted');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),directory=mkdtempSync(join(tmpdir(),'breditor-selected-delivery-installed-')),archives=join(directory,'archives'),consumer=join(directory,'consumer'),sha=bytes=>createHash('sha256').update(bytes).digest('hex'),npm=process.env.BREDITOR_NPM??'npm',node=process.execPath,host=join(root,'target/owned-history-relay-native/release/examples/selected_delivery_functional'),hostSha256=sha(readFileSync(host));
mkdirSync(archives);mkdirSync(consumer);
const names=['@breditor/browser','@breditor/experimental-rich-content','@breditor/collaboration'],packs=JSON.parse(execFileSync(npm,['pack','--ignore-scripts','--json','--pack-destination',archives,...names.flatMap(name=>['--workspace',name])],{cwd:root,encoding:'utf8'})),producer=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8')),locked=searchConsumerLock(producer,packs.map(pack=>({name:pack.name,path:join(archives,pack.filename)})));
writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));execFileSync(npm,['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(readFileSync(join(consumer,'package-lock.json'),'utf8')));
for(const name of names)assert.ok(realpathSync(join(consumer,'node_modules',name)).startsWith(realpathSync(consumer)+'/node_modules/'));
const fixtures=['selected-delivery/native-host.mjs','room-participant-inventory/environment.mjs','review-assets/pixels.mjs','interchange-consumer/pixel.mjs'];
for(const path of fixtures){const target=join(consumer,'fixtures',path);mkdirSync(dirname(target),{recursive:true});cpSync(join(root,'scripts/fixtures',path),target);}
for(const file of ['types-relay-quiescence.ts','types-generation-recovery-control.ts']){
 cpSync(join(root,'scripts/fixtures/editor-consumer',file),join(consumer,file));
 execFileSync(node,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM',file],{cwd:consumer,stdio:'inherit'});
}
let probe=readFileSync(join(root,'scripts/probe-selected-delivery.mjs'),'utf8');
const sourceModule="new URL('../packages/breditor-collaboration/dist/index.js',import.meta.url)";
assert.equal(probe.split(sourceModule).length,2);probe=probe.replace(sourceModule,"'@breditor/collaboration'");assert.ok(!probe.includes('../packages/'));writeFileSync(join(consumer,'probe.mjs'),probe);
writeFileSync(join(consumer,'run.mjs'),"import{probeSelectedDeliveryMatrix}from'./probe.mjs';import{pathToFileURL}from'node:url';const options=process.argv[4]?{sdkModule:pathToFileURL(process.argv[4])}:{};console.log(JSON.stringify(await probeSelectedDeliveryMatrix(process.argv[2],process.argv[3],options)));");
const runtime=join(consumer,'node_modules/@breditor/collaboration/dist/runtime'),execute=extra=>JSON.parse(execFileSync(node,['run.mjs',root,runtime,...extra],{cwd:consumer,encoding:'utf8',maxBuffer:4*1024*1024,timeout:1800000})),acceptance=execute([]);
writeFileSync(join(consumer,'entry.mjs'),"export{SharedServerLogGenerationRecoveryHost,SharedReviewPersistentSession,SharedRelaySync,SharedReviewRelaySync,encodeSharedPairedSessionBackup,registerSharedRelayWriter}from'@breditor/collaboration';");
const output=await build({configFile:false,root:consumer,logLevel:'error',build:{target:'es2022',outDir:join(consumer,'bundle'),minify:true,lib:{entry:join(consumer,'entry.mjs'),formats:['es'],fileName:()=> 'selected-delivery.mjs'},rollupOptions:{output:{inlineDynamicImports:true}}}}),modules=(Array.isArray(output)?output:[output]).flatMap(result=>result.output).filter(row=>row.type==='chunk').flatMap(row=>Object.keys(row.modules)),bundle=join(consumer,'bundle/selected-delivery.mjs'),bundled=execute([bundle]);
for(const required of ['/dist/relay/work_custody.js','/dist/generation_recovery_control/host.js','/dist/relay/review_sync.js'])assert.ok(modules.some(path=>path.includes('/node_modules/@breditor/collaboration')&&path.endsWith(required)));
assert.ok(!modules.some(path=>path.includes(join(root,'packages'))||path.includes('fake-indexeddb')||path.includes('/node_modules/react/')));
for(const result of [acceptance,bundled]){assert.equal(result.passed,true);assert.equal(result.cases.length,10);assert.equal(result.authors,70);assert.equal(result.futureHistorySteps,280);assert.ok(result.cases.every(row=>row.completePreviousCutPreserved===true));assert.equal(result.normalWasmSha256,NORMAL_SHARED_WASM_SHA256);assert.equal(result.nativeHostSha256,hostSha256);}
assert.equal(sha(readFileSync(host)),hostSha256);assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/native-selected-delivery-installed-consumer',formatVersion:1,passed:true,source,sourceUnchanged:true,directory,consumer,strictPublicTypes:true,workspaceLinks:false,registryArtifacts,archives:packs.map(pack=>({name:pack.name,path:join(archives,pack.filename),sha256:sha(readFileSync(join(archives,pack.filename)))})),acceptance,bundled,executedProductionBundle:{path:bundle,sha256:sha(readFileSync(bundle)),modules:modules.length},nativeHostSha256:hostSha256,normalWasmSha256:NORMAL_SHARED_WASM_SHA256,scope:'Both fresh installation and executed minified bundle run all ten original native grammar/wire modes, seven authors each: genuine sealed old source/durable target, actual authentication/raster bytes/receipts, idempotent reconnect, native Undo/Redo and cold paired reopen. No SDK workspace links; synthetic Node IDB/locks. NOT mixed seven-family retained-owner delivery, metadata outbox/provider reconciliation, whole-room/browser activation or V1 approval.'};
saveEvidence(join(directory,'result.json'),report);saveEvidence(join(root,'target/selected-delivery-installed-consumer.json'),report);console.log(JSON.stringify(report));
