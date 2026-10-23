/** Fresh candidate archives, exact source assertions and the fixed 480-case
 * native domain. Private imports are test-only, not public API promotion. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,cpSync,realpathSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'vite';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
if(process.argv.length!==2)throw Error('No substituted runtime, assertions or reduced domain accepted');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root);
const directory=mkdtempSync(join(tmpdir(),'breditor-flat-local-installed-')),archives=join(directory,'archives'),consumer=join(directory,'consumer');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),node=process.execPath,npm=process.env.BREDITOR_NPM??'npm';
mkdirSync(archives);mkdirSync(consumer);
const names=['@breditor/browser','@breditor/experimental-rich-content','@breditor/collaboration'];
const packs=JSON.parse(execFileSync(npm,['pack','--offline','--ignore-scripts','--json','--pack-destination',archives,...names.flatMap(name=>['--workspace',name])],{cwd:root,encoding:'utf8'}));
const paths=packs.map(row=>join(archives,row.filename)),producer=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8'));
const locked=searchConsumerLock(producer,packs.map((row,i)=>({name:row.name,path:paths[i]})));
writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));
execFileSync(npm,['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(readFileSync(join(consumer,'package-lock.json'),'utf8')));
for(const name of names)assert.ok(realpathSync(join(consumer,'node_modules',name)).startsWith(realpathSync(consumer)+'/node_modules/'));
const copiedAssertions=[];
function relocated(original,rewrites,name){let copy=original;const used=[];for(const[from,to]of rewrites)if(copy.includes(from)){copy=copy.replaceAll(from,to);used.push([from,to]);}let back=copy;for(const[from,to]of used.toReversed())back=back.replaceAll(to,from);assert.equal(back,original,'Only reversible module/runtime/fixture locations may change');copiedAssertions.push({name,sourceSha256:sha(original),installedSha256:sha(copy),reversibleLocationsOnly:true});return copy;}
for(const path of['owned-core-cleanup/session.mjs','independent-recovery/session.mjs','independent-local-operation/participant.mjs','independent-local-operation/portable.mjs','restored-local-operation/session.mjs','room-participant-inventory/environment.mjs','review-assets/pixels.mjs','interchange-consumer/pixel.mjs','independent-delivery-recovery/storage.mjs','flat-local-operation/session.mjs']){
 const target=join(consumer,'fixtures',path);mkdirSync(dirname(target),{recursive:true});const original=readFileSync(join(root,'scripts/fixtures',path),'utf8');
 const copy=relocated(original,[['../../../packages/breditor-collaboration/dist/','../../node_modules/@breditor/collaboration/dist/']],'fixtures/'+path);writeFileSync(target,copy);
}
cpSync(join(root,'crates/breditor-core/tests/fixtures/rich-local-root.json'),join(consumer,'rich-local-root.json'));
const typeFiles=['types-flat-local-journal.ts','types-flat-local-participant.ts'];
for(const name of typeFiles){const original=readFileSync(join(root,'scripts/fixtures/editor-consumer',name),'utf8');writeFileSync(join(consumer,name),relocated(original,[['../../../packages/breditor-collaboration/dist/','./node_modules/@breditor/collaboration/dist/']],name));}
execFileSync(node,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM,ESNext.Disposable',...typeFiles],{cwd:consumer,stdio:'inherit'});
const unitFiles=['flat-local-framing.test.mjs','flat-local-journal.test.mjs','flat-local-participant.test.mjs','flat-local-admission.test.mjs','flat-local-constructor.test.mjs','flat-local-participant-failure.test.mjs','flat-local-participant-admission.test.mjs','flat-local-participant-lifetime.test.mjs','flat-local-participant-policy.test.mjs','flat-local-participant-read-factory.test.mjs','flat-local-participant-read-runtime.test.mjs','flat-local-participant-read-policy.test.mjs'];
const rewrites=[['../packages/breditor-collaboration/dist/','./node_modules/@breditor/collaboration/dist/'],['../crates/breditor-core/tests/fixtures/rich-local-root.json','./rich-local-root.json'],['../target/promoted-shared-web/','./node_modules/@breditor/collaboration/dist/runtime/']];
for(const name of unitFiles){const original=readFileSync(join(root,'scripts',name),'utf8'),copy=relocated(original,rewrites,name);assert.ok(!copy.includes('../packages/')&&!copy.includes('../crates/'));writeFileSync(join(consumer,name),copy);}
const runtime=join(consumer,'node_modules/@breditor/collaboration/dist/runtime');
const unit=execFileSync(node,['--test',...unitFiles],{cwd:consumer,encoding:'utf8',env:{...process.env,BREDITOR_FLAT_LOCAL_RUNTIME:runtime},timeout:1200000,maxBuffer:12*1024*1024});
assert.match(unit,/^# pass 66$/m);assert.match(unit,/^# fail 0$/m);assert.match(unit,/^# skipped 0$/m);writeFileSync(join(directory,'contracts.log'),unit);
const probe=readFileSync(join(root,'scripts/probe-flat-local-participant.mjs'));writeFileSync(join(consumer,'probe.mjs'),probe);assert.equal(sha(readFileSync(join(consumer,'probe.mjs'))),sha(probe));
writeFileSync(join(consumer,'acceptance.mjs'),"import*as api from'@breditor/collaboration';import*as rich from'@breditor/experimental-rich-content';import*as old from'./node_modules/@breditor/collaboration/dist/independent_local_operation/participant.js';import*as capture from'./node_modules/@breditor/collaboration/dist/independent_local_operation/portable_capture.js';import*as native from'./node_modules/@breditor/collaboration/dist/independent_history/native_port.js';import*as journal from'./node_modules/@breditor/collaboration/dist/flat_local_operation/journal.js';import*as parent from'./node_modules/@breditor/collaboration/dist/flat_local_operation/participant.js';import{probeFlatLocalParticipant}from'./probe.mjs';console.log(JSON.stringify(await probeFlatLocalParticipant({api,rich,internals:{...old,...capture,...native,...journal,...parent},runtime:process.argv[2],fixture:new URL('./rich-local-root.json',import.meta.url)})));\n");
const acceptance=JSON.parse(execFileSync(node,['acceptance.mjs',runtime],{cwd:consumer,encoding:'utf8',timeout:14400000,maxBuffer:8*1024*1024}));
assert.equal(acceptance.passed,true);assert.equal(acceptance.cases,480);assert.equal(acceptance.sharedWasmSha256,sha(readFileSync(join(root,'target/promoted-shared-web/breditor_shared_bg.wasm'))));
writeFileSync(join(consumer,'entry.mjs'),"export{OperationalFlatLocalParticipant}from'./node_modules/@breditor/collaboration/dist/flat_local_operation/participant.js';export{captureFlatLocalOperation}from'./node_modules/@breditor/collaboration/dist/flat_local_operation/capture.js';\n");
const output=await build({configFile:false,root:consumer,logLevel:'error',build:{target:'es2022',write:false,minify:false,lib:{entry:join(consumer,'entry.mjs'),formats:['es'],fileName:'flat-local-participant-proof'}}});
const modules=(Array.isArray(output)?output:[output]).flatMap(row=>row.output).filter(row=>row.type==='chunk').flatMap(row=>Object.keys(row.modules));
for(const path of['flat_local_operation/participant','flat_local_operation/participant_record','flat_local_operation/participant_database','flat_local_operation/participant_state','flat_local_operation/journal','flat_local_operation/input','flat_local_operation/cut_validation','flat_local_operation/framing','flat_local_operation/archive','flat_local_operation/capture','native_input_operation/journal_kernel','native_input_operation/journal_families','native_input_operation/participant_opening','native_input_operation/participant_uploads','native_input_operation/participant_witness'])assert.ok(modules.some(name=>name.endsWith('/node_modules/@breditor/collaboration/dist/'+path+'.js')),path);
assert.ok(!modules.some(name=>name.includes(join(root,'packages'))||name.includes('/node_modules/react/')||name.includes('fake-indexeddb')));assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/flat-local-operation-participant-installed-consumer',formatVersion:1,passed:true,source,sourceUnchanged:true,consumer,workspaceLinks:false,strictPublicTypes:true,registryArtifacts,archives:packs.map((row,i)=>({name:row.name,path:paths[i],sha256:sha(readFileSync(paths[i]))})),copiedAssertions:{files:copiedAssertions,reversibleModuleRuntimeAndFixtureLocationsOnly:true,probeByteIdentical:true},unitContracts:{passed:66,failed:0,skipped:0,log:join(directory,'contracts.log')},acceptance,productionModuleCount:modules.length,noWorkspaceReactOrSyntheticStorageInProduction:true,scope:'Actual production-source flat framing and full-chain admission, three repeated native generations in all four history combinations, genuine shared kernel/opening/upload/final witnesses, complete four-name parent and fixed 480-case compiler/selection/capability/history matrix. No prototype owner overlay, room adoption, sustainable native history, physical durability, authenticated activation or V1 approval.'};
saveEvidence(join(root,'target/flat-local-operation-participant-installed-consumer.json'),report);console.log(JSON.stringify(report,null,2));
