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
import {fileEvidence,sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {copySharedRuntimeForActivation,selectSharedRuntimeBuild} from './candidate-release/shared-runtime-evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
import {historicalSharedWasmSha256,pinnedSharedRuntimeReceipt} from './fixtures/native-runtime/shared-runtime-receipt.mjs';
if(process.argv.length!==2)throw Error('No reduced or substituted qualification accepted');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=sourceEvidence(root);
const directory=mkdtempSync(join(realpathSync(tmpdir()),'breditor-selected-delivery-installed-'));
const archives=join(directory,'archives');
const consumer=join(directory,'consumer');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const npm=process.env.BREDITOR_NPM??'npm';
const node=process.execPath;
const nativeHostPath='target/owned-history-relay-native/release/examples/selected_delivery_functional';
const host=join(root,nativeHostPath),hostSha256=fileEvidence(root,nativeHostPath).sha256;
mkdirSync(archives);mkdirSync(consumer);
const sharedRuntime=copySharedRuntimeForActivation(root,consumer,source);
const normalWasmSha256=sharedRuntime?.wasmSha256??historicalSharedWasmSha256;
const installedHost=join(consumer,nativeHostPath);
mkdirSync(dirname(installedHost),{recursive:true});
cpSync(host,installedHost);
const names=['@breditor/browser','@breditor/experimental-rich-content','@breditor/collaboration'],packs=JSON.parse(execFileSync(npm,['pack','--offline','--ignore-scripts','--json','--pack-destination',archives,...names.flatMap(name=>['--workspace',name])],{cwd:root,encoding:'utf8'})),producer=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8')),locked=searchConsumerLock(producer,packs.map(pack=>({name:pack.name,path:join(archives,pack.filename)})));
writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));execFileSync(npm,['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(readFileSync(join(consumer,'package-lock.json'),'utf8')));
for(const name of names)assert.ok(realpathSync(join(consumer,'node_modules',name)).startsWith(realpathSync(consumer)+'/node_modules/'));
const runtimePath='node_modules/@breditor/collaboration/dist/runtime';
function verifyInstalledInputs(){
 assert.equal(fileEvidence(consumer,nativeHostPath).sha256,hostSha256);
 assert.equal(fileEvidence(consumer,runtimePath+'/breditor_shared_bg.wasm').sha256,normalWasmSha256);
 if(!sharedRuntime)return;
 const {report}=pinnedSharedRuntimeReceipt(consumer,sharedRuntime.sha256);
 assert.deepEqual(report.source,source);
 for(const {name,bytes,sha256} of report.files){
  const actual=fileEvidence(consumer,runtimePath+'/'+name);
  assert.equal(actual.bytes,bytes,name);
  assert.equal(actual.sha256,sha256,name);
 }
}
verifyInstalledInputs();

const fixtures=['room-participant-inventory/environment.mjs','review-assets/pixels.mjs','interchange-consumer/pixel.mjs','server-generation-archive/transport.mjs'];
for(const path of fixtures){const target=join(consumer,'fixtures',path);mkdirSync(dirname(target),{recursive:true});cpSync(join(root,'scripts/fixtures',path),target);}
const nativeFixture='fixtures/selected-delivery/native-host.mjs';
const nativeFixtureSource=readFileSync(join(root,'scripts',nativeFixture),'utf8');
const nativeSourceImport='../../../packages/breditor-collaboration/dist/';
const nativeInstalledImport='../../node_modules/@breditor/collaboration/dist/';
const nativeFixtureInstalled=nativeFixtureSource.replaceAll(nativeSourceImport,nativeInstalledImport);
assert.equal(nativeFixtureInstalled.replaceAll(nativeInstalledImport,nativeSourceImport),nativeFixtureSource);
assert.doesNotMatch(nativeFixtureInstalled,/\.\.\/packages\/breditor-/);
mkdirSync(dirname(join(consumer,nativeFixture)),{recursive:true});
writeFileSync(join(consumer,nativeFixture),nativeFixtureInstalled);
for(const file of ['types-relay-quiescence.ts','types-generation-recovery-control.ts','types-generation-delivery-recovery-control.ts','types-generation-delivery-path-control.ts']){
 cpSync(join(root,'scripts/fixtures/editor-consumer',file),join(consumer,file));
 execFileSync(node,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM',file],{cwd:consumer,stdio:'inherit'});
}
// Execute the identical refusal/lifetime laws against installed modules, not workspace code.
const sourceLaws=readFileSync(join(root,'scripts/generation-delivery-control.test.mjs'),'utf8'),from='../packages/breditor-collaboration/dist/',to='./node_modules/@breditor/collaboration/dist/';
assert.equal(sourceLaws.split(from).length,5);const installedLaws=sourceLaws.replaceAll(from,to);assert.equal(installedLaws.replaceAll(to,from),sourceLaws);assert.ok(!installedLaws.includes('../packages/'));
writeFileSync(join(consumer,'generation-delivery-control.test.mjs'),installedLaws);
const lawLog=execFileSync(node,['--test','generation-delivery-control.test.mjs'],{cwd:consumer,encoding:'utf8',maxBuffer:4*1024*1024,timeout:120000});
writeFileSync(join(consumer,'generation-delivery-control.tap'),lawLog);assert.match(lawLog,/# tests 34\b/);assert.match(lawLog,/# pass 34\b/);assert.match(lawLog,/# fail 0\b/);assert.match(lawLog,/# skipped 0\b/);
const pathSourceLaws=readFileSync(join(root,'scripts/generation-delivery-path-control.test.mjs'),'utf8');
assert.equal(pathSourceLaws.split(from).length,6);const installedPathLaws=pathSourceLaws.replaceAll(from,to);assert.equal(installedPathLaws.replaceAll(to,from),pathSourceLaws);assert.ok(!installedPathLaws.includes('../packages/'));
writeFileSync(join(consumer,'generation-delivery-path-control.test.mjs'),installedPathLaws);
const pathLawLog=execFileSync(node,['--test','generation-delivery-path-control.test.mjs'],{cwd:consumer,encoding:'utf8',maxBuffer:4*1024*1024,timeout:120000});
writeFileSync(join(consumer,'generation-delivery-path-control.tap'),pathLawLog);assert.match(pathLawLog,/# tests 42\b/);assert.match(pathLawLog,/# pass 42\b/);assert.match(pathLawLog,/# fail 0\b/);assert.match(pathLawLog,/# skipped 0\b/);
const sourceProbe=readFileSync(join(root,'scripts/probe-selected-delivery.mjs'),'utf8');
const sourceModule="new URL('../packages/breditor-collaboration/dist/index.js',import.meta.url)";
assert.equal(sourceProbe.split(sourceModule).length,2);
const probe=sourceProbe.replace(sourceModule,"'@breditor/collaboration'");
assert.equal(probe.replace("'@breditor/collaboration'",sourceModule),sourceProbe);
assert.ok(!probe.includes('../packages/'));
writeFileSync(join(consumer,'probe.mjs'),probe);
writeFileSync(join(consumer,'run.mjs'),"import{probeSelectedDeliveryMatrix}from'./probe.mjs';import{pathToFileURL}from'node:url';const options=process.argv[4]?{sdkModule:pathToFileURL(process.argv[4])}:{};console.log(JSON.stringify(await probeSelectedDeliveryMatrix(process.argv[2],process.argv[3],options)));");
const runtime=join(consumer,runtimePath),execute=extra=>JSON.parse(execFileSync(node,['run.mjs',consumer,runtime,...extra],{cwd:consumer,encoding:'utf8',maxBuffer:4*1024*1024,timeout:1800000})),acceptance=execute([]);
writeFileSync(join(consumer,'entry.mjs'),"export{SharedServerLogGenerationDeliveryPathRecoveryHost,SharedServerLogGenerationDeliveryRecoveryHost,SharedServerLogGenerationRecoveryHost,SharedReviewPersistentSession,SharedRelaySync,SharedReviewRelaySync,encodeSharedPairedSessionBackup,registerSharedRelayWriter}from'@breditor/collaboration';");
const output=await build({configFile:false,root:consumer,logLevel:'error',build:{target:'es2022',outDir:join(consumer,'bundle'),minify:true,lib:{entry:join(consumer,'entry.mjs'),formats:['es'],fileName:()=> 'selected-delivery.mjs'},rollupOptions:{output:{inlineDynamicImports:true}}}}),modules=(Array.isArray(output)?output:[output]).flatMap(result=>result.output).filter(row=>row.type==='chunk').flatMap(row=>Object.keys(row.modules)),bundle=join(consumer,'bundle/selected-delivery.mjs'),bundled=execute([bundle]);
for(const required of ['/dist/relay/work_custody.js','/dist/generation_delivery_path_control/host.js','/dist/generation_delivery_control/host.js','/dist/generation_recovery_control/host.js','/dist/relay/review_sync.js'])assert.ok(modules.some(path=>path.includes('/node_modules/@breditor/collaboration')&&path.endsWith(required)));
assert.ok(!modules.some(path=>path.includes(join(root,'packages'))||path.includes('fake-indexeddb')||path.includes('/node_modules/react/')));
for(const result of [acceptance,bundled]){
 assert.equal(result.passed,true);
 assert.equal(result.cases.length,10);
 assert.equal(result.authors,70);
 assert.equal(result.futureHistorySteps,280);
 assert.ok(result.cases.every(row=>row.completePreviousCutPreserved===true&&row.authenticatedAdvancedCutRead===true&&row.latestPreviousCutPreserved===true&&row.completeNativePathPreserved===true&&row.authenticatedCompleteNativePathRead===true));
 assert.equal(result.normalWasmSha256,normalWasmSha256);
 assert.equal(result.nativeHostSha256,hostSha256);
 for(const {fixtureDirectory} of result.cases)assert.ok(realpathSync(fixtureDirectory).startsWith(join(consumer,'target')+'/'));
}
verifyInstalledInputs();
assert.equal(fileEvidence(root,nativeHostPath).sha256,hostSha256);
assert.deepEqual(sourceEvidence(root),source);
assert.deepEqual(selectSharedRuntimeBuild(root,source),sharedRuntime);
const report={format:'breditor/native-selected-delivery-installed-consumer',formatVersion:1,passed:true,source,sourceUnchanged:true,directory,consumer,strictPublicTypes:true,installedWireLaws:{tests:34,passed:34,skipped:0,unchangedAssertions:true,path:join(consumer,'generation-delivery-control.tap'),sha256:sha(Buffer.from(lawLog))},installedPathWireLaws:{tests:42,passed:42,skipped:0,unchangedAssertions:true,path:join(consumer,'generation-delivery-path-control.tap'),sha256:sha(Buffer.from(pathLawLog))},workspaceLinks:false,registryArtifacts,archives:packs.map(pack=>({name:pack.name,path:join(archives,pack.filename),sha256:sha(readFileSync(join(archives,pack.filename)))})),acceptance,bundled,executedProductionBundle:{path:bundle,sha256:sha(readFileSync(bundle)),modules:modules.length},nativeHostSha256:hostSha256,nativeHostPath:installedHost,normalWasmSha256,sharedRuntimeReceiptSha256:sharedRuntime?.sha256??null,scope:'Both fresh installation and executed minified bundle run all ten original native grammar/wire modes, seven authors each: genuine sealed old source/durable target, actual authentication/raster bytes/receipts, idempotent reconnect, native Undo/Redo and cold paired reopen. No SDK workspace links; synthetic Node IDB/locks. NOT mixed seven-family retained-owner delivery, metadata outbox/provider reconciliation, whole-room/browser activation or V1 approval.'};
saveEvidence(join(directory,'result.json'),report);saveEvidence(join(root,'target/selected-delivery-installed-consumer.json'),report);console.log(JSON.stringify(report));
