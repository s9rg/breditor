/** Fresh offline public archives repeat native and managed read-only archival assertions unchanged. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'vite';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),temporary=mkdtempSync(join(tmpdir(),'breditor-read-only-history-installed-')),archives=join(temporary,'archives'),consumer=join(temporary,'consumer'),node=process.execPath,npm=process.env.BREDITOR_NPM??process.env.NPM_BIN??'npm',sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(process.argv.length!==2)throw Error('Use current explicitly built runtime; no automatic producer build or publication');
mkdirSync(archives);mkdirSync(consumer);
const names=['@breditor/browser','@breditor/experimental-rich-content','@breditor/collaboration'],packs=JSON.parse(execFileSync(npm,['pack','--ignore-scripts','--json','--pack-destination',archives,...names.flatMap(name=>['--workspace',name])],{cwd:root,encoding:'utf8'})),paths=packs.map(pack=>join(archives,pack.filename)),producer=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8')),locked=searchConsumerLock(producer,packs.map((pack,index)=>({name:pack.name,path:paths[index]})));
writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));execFileSync(npm,['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(readFileSync(join(consumer,'package-lock.json'),'utf8')));for(const name of names)assert.ok(realpathSync(join(consumer,'node_modules',name)).startsWith(realpathSync(consumer)+'/node_modules/'));
cpSync(join(root,'scripts/fixtures/editor-consumer/types-read-only-history.ts'),join(consumer,'types-read-only-history.ts'));cpSync(join(root,'crates/breditor-core/tests/fixtures/rich-local-root.json'),join(consumer,'rich-local-root.json'));
execFileSync(node,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM,ESNext.Disposable','types-read-only-history.ts'],{cwd:consumer,stdio:'inherit'});
const runtime=join(consumer,'node_modules/@breditor/collaboration/dist/runtime'),results=[];
for(const name of ['probe-read-only-history-native','probe-read-only-history-sdk']){
 const original=readFileSync(join(root,`scripts/${name}.mjs`),'utf8'),from="'../packages/breditor-collaboration/dist/index.js'",to="'@breditor/collaboration'",fixture="new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)",local="new URL('./rich-local-root.json',import.meta.url)",probe=original.replaceAll(from,to).replace(fixture,local);
 assert.ok(!probe.includes('../packages/')&&!probe.includes('../crates/'));assert.equal(probe.replaceAll(to,from).replace(local,fixture),original);writeFileSync(join(consumer,`${name}.mjs`),probe);results.push(JSON.parse(execFileSync(node,[`${name}.mjs`,runtime],{cwd:consumer,encoding:'utf8',timeout:600000,maxBuffer:2*1024*1024})));
}
const [native,sdk]=results;
for(const [key,value]of Object.entries({passed:true,cases:144,coldPairs:144,enabledDocumentArchives:72,enabledReviewArchives:72,strictObserverRefusals:288,readOnlySeals:288,futurePairedComparisons:432,rootFileComparisons:288,activeFileComparisons:288}))assert.equal(native[key],value,key);
for(const [key,value]of Object.entries({passed:true,cases:216,pairedCases:144,coldPairs:648,passiveSeals:432,oldObserverRefusals:216,rootFileComparisons:432,firstSealedFileComparisons:216,saveAborts:2,lostAcknowledgements:2,futureHistoryPairs:648}))assert.equal(sdk[key],value,key);
writeFileSync(join(consumer,'entry.mjs'),'export {SharedRichEditor,SharedSegmentedPersistentSession,SharedSegmentedRelaySession} from "@breditor/collaboration";');
const output=await build({configFile:false,root:consumer,logLevel:'error',build:{target:'es2022',write:false,minify:false,lib:{entry:join(consumer,'entry.mjs'),formats:['es'],fileName:'read-only-history-proof'}}}),modules=(Array.isArray(output)?output:[output]).flatMap(result=>result.output).filter(item=>item.type==='chunk').flatMap(item=>Object.keys(item.modules));
assert.ok(modules.some(path=>path.includes('/node_modules/@breditor/collaboration/dist/persistence/segmented_session.js')));assert.ok(!modules.some(path=>path.includes(join(root,'packages'))||path.includes('/node_modules/react/')||path.includes('fake-indexeddb')));
const sharedWasmSha256=sha(readFileSync(join(runtime,'breditor_shared_bg.wasm')));assert.equal(sharedWasmSha256,sha(readFileSync(join(root,'target/promoted-shared-web/breditor_shared_bg.wasm'))));assert.equal(native.sharedWasmSha256,sharedWasmSha256);assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/read-only-history-installed-consumer',passed:true,source,sourceUnchanged:true,consumer,workspaceLinks:false,strictPublicTypes:true,registryArtifacts,archives:packs.map((pack,index)=>({name:pack.name,path:paths[index],sha256:sha(readFileSync(paths[index]))})),native,sdk,sharedWasmSha256,productionModuleCount:modules.length,noWorkspaceReactOrSyntheticStorageInProduction:true,scope:'Fresh offline public native/managed read-only archive consumers. Synthetic storage/locks, no stored-role import, implicit old-family migration, independent comment-generation SDK storage, relay generations or V1 approval.'};saveEvidence(join(root,'target/read-only-history-installed-consumer.json'),report);console.log(JSON.stringify(report,null,2));
