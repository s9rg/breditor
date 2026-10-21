/** Fresh offline public archives must satisfy the same native-custody regression. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'vite';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),temporary=mkdtempSync(join(tmpdir(),'breditor-managed-core-installed-')),archives=join(temporary,'archives'),consumer=join(temporary,'consumer'),node=process.execPath,npm=process.env.BREDITOR_NPM??process.env.NPM_BIN??'npm',sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(process.argv.length!==2)throw Error('Use current explicitly built candidate; no automatic producer build or publication');
mkdirSync(archives);mkdirSync(consumer);
const names=['@breditor/browser','@breditor/experimental-rich-content','@breditor/collaboration'],packs=JSON.parse(execFileSync(npm,['pack','--ignore-scripts','--json','--pack-destination',archives,...names.flatMap(name=>['--workspace',name])],{cwd:root,encoding:'utf8'})),paths=packs.map(pack=>join(archives,pack.filename)),producer=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8')),locked=searchConsumerLock(producer,packs.map((pack,index)=>({name:pack.name,path:paths[index]})));
writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));execFileSync(npm,['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(readFileSync(join(consumer,'package-lock.json'),'utf8')));for(const name of names)assert.ok(realpathSync(join(consumer,'node_modules',name)).startsWith(realpathSync(consumer)+'/node_modules/'));
const runtime=join(consumer,'node_modules/@breditor/collaboration/dist/runtime'),results=[];
for(const name of ['probe-managed-core-binding','probe-managed-original-core-binding','probe-relay-core-binding']){
 const originalProbe=readFileSync(join(root,`scripts/${name}.mjs`),'utf8'),from="'../packages/breditor-collaboration/dist/index.js'",to="'@breditor/collaboration'";assert.equal(originalProbe.split(from).length,2);const probe=originalProbe.replace(from,to);assert.ok(!probe.includes('../packages/')&&!probe.includes('../crates/'));assert.equal(probe.replace(to,from),originalProbe);writeFileSync(join(consumer,`${name}.mjs`),probe);
 results.push(JSON.parse(execFileSync(node,[`${name}.mjs`,runtime],{cwd:consumer,encoding:'utf8',timeout:600000,maxBuffer:2*1024*1024})));
}
const [segmented,original,relay]=results;
for(const [value,cases,checks,cleanup,failedSave]of [[segmented,72,432,144,2],[original,144,864,288,4]]){assert.equal(value.passed,true);assert.equal(value.cases,cases);assert.equal(value.captureRefusals,1728);assert.equal(value.accessorCalls,0);assert.equal(value.exactPairChecks,checks);assert.equal(value.cleanupChecks,cleanup);assert.equal(value.failedCloseChecks,cases);assert.equal(value.failedSaveChecks,failedSave);}
writeFileSync(join(consumer,'entry.mjs'),'export {SharedSegmentedPersistentSession,SharedPersistentSession,SharedReviewPersistentSession} from "@breditor/collaboration";');
const output=await build({configFile:false,root:consumer,logLevel:'error',build:{target:'es2022',write:false,minify:false,lib:{entry:join(consumer,'entry.mjs'),formats:['es'],fileName:'managed-core-proof'}}}),modules=(Array.isArray(output)?output:[output]).flatMap(result=>result.output).filter(item=>item.type==='chunk').flatMap(item=>Object.keys(item.modules));
for(const file of ['segmented_session','shared_session','review_session'])assert.ok(modules.some(path=>path.includes(`/node_modules/@breditor/collaboration/dist/persistence/${file}.js`)));assert.ok(!modules.some(path=>path.includes(join(root,'packages'))||path.includes('/node_modules/react/')||path.includes('fake-indexeddb')));
const wasm=sha(readFileSync(join(runtime,'breditor_shared_bg.wasm')));assert.equal(wasm,sha(readFileSync(join(root,'target/promoted-shared-web/breditor_shared_bg.wasm'))));assert.equal(segmented.sharedWasmSha256,wasm);assert.equal(original.sharedWasmSha256,wasm);assert.deepEqual(sourceEvidence(root),source);
for(const [key,value]of Object.entries({passed:true,cases:36,shadowRefusals:72,getterCalls:0,exactNativeCuts:72,successfulSeals:36,coldReopens:36,sharedWasmSha256:wasm}))assert.equal(relay[key],value,key);
const report={format:'breditor/managed-core-binding-installed-consumer',passed:true,source,sourceUnchanged:true,consumer,workspaceLinks:false,registryArtifacts,archives:packs.map((pack,index)=>({name:pack.name,path:paths[index],sha256:sha(readFileSync(paths[index]))})),segmented,original,relay,sharedWasmSha256:wasm,productionModuleCount:modules.length,noWorkspaceReactOrSyntheticStorageInProduction:true,scope:'Fresh offline public archives with producer-pinned dependencies and actual normal native owners. Synthetic storage/locks only; no old protocol, role or release promotion.'};
saveEvidence(join(root,'target/managed-core-binding-installed-consumer.json'),report);console.log(JSON.stringify(report,null,2));
