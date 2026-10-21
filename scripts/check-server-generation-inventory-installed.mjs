/** Identical native-prefix assertions through fresh offline archives, not workspace links. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'vite';
import {sourceEvidence,fileEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),node=process.execPath,npm=process.env.BREDITOR_NPM??process.env.NPM_BIN??'npm',sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(process.argv.length!==2)throw Error('No substituted native fixtures or runtime accepted');
const nativePath='target/server-generation-inventory-native.json',native=JSON.parse(readFileSync(join(root,nativePath),'utf8'));assert.equal(native.passed,true);assert.deepEqual(native.source,source,'Build exact-source physical native fixtures first');for(const file of native.files)assert.deepEqual(fileEvidence(root,file.path),file);
assert.deepEqual(fileEvidence(root,native.manifestEvidence.path),native.manifestEvidence);
const directory=mkdtempSync(join(tmpdir(),'breditor-server-generation-inventory-installed-')),archives=join(directory,'archives'),consumer=join(directory,'consumer');mkdirSync(archives);mkdirSync(consumer);
const names=['@breditor/browser','@breditor/experimental-rich-content','@breditor/collaboration'];
const packs=JSON.parse(execFileSync(npm,['pack','--offline','--ignore-scripts','--json','--pack-destination',archives,...names.flatMap(name=>['--workspace',name])],{cwd:root,encoding:'utf8'})),paths=packs.map(pack=>join(archives,pack.filename)),producer=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8')),locked=searchConsumerLock(producer,packs.map((pack,index)=>({name:pack.name,path:paths[index]})));
writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));
execFileSync(npm,['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(readFileSync(join(consumer,'package-lock.json'),'utf8')));for(const name of names)assert.ok(realpathSync(join(consumer,'node_modules',name)).startsWith(realpathSync(consumer)+'/node_modules/'));
for(const name of ['room-participant-inventory/environment.mjs','room-participant-inventory/generation-participant.mjs','room-participant-inventory/participant.mjs','server-generation-inventory/mixed.mjs','review-assets/pixels.mjs','interchange-consumer/pixel.mjs']){const destination=join(consumer,'fixtures',name);mkdirSync(dirname(destination),{recursive:true});cpSync(join(root,'scripts/fixtures',name),destination);}
cpSync(join(root,'scripts/fixtures/editor-consumer/types-server-generation-inventory.ts'),join(consumer,'types-server-generation-inventory.ts'));
execFileSync(node,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM','types-server-generation-inventory.ts'],{cwd:consumer,stdio:'inherit'});
const original=readFileSync(join(root,'scripts/probe-server-generation-inventory.mjs'),'utf8');let probe=original;
for(const[from,to]of [["import('../packages/breditor-collaboration/dist/index.js')","import('@breditor/collaboration')"],["import('../packages/breditor-experimental-rich-content/index.js')","import('@breditor/experimental-rich-content')"]]){assert.equal(probe.split(from).length,2,from);probe=probe.replace(from,to);}
assert.ok(!probe.includes('../packages/')&&!probe.includes('../target/'));writeFileSync(join(consumer,'probe.mjs'),probe);
const runtime=join(consumer,'node_modules/@breditor/collaboration/dist/runtime');
const acceptance=JSON.parse(execFileSync(node,['probe.mjs',runtime,native.manifest],{cwd:consumer,encoding:'utf8',maxBuffer:2*1024*1024,timeout:360000}));
for(const[key,value]of Object.entries({passed:true,nativeRooms:10,longNativeCuts:1,physicalOnlyCuts:10,originalParticipants:20,generationParticipants:60,sourceFamilies:30,coldParticipants:60,coveredStreams:120,mixedCohorts:60,mixedDuplicateRefusals:120,crossFamilyWriterOwnershipRefusals:60,crossFamilyReviewOwnershipRefusals:1,futureDocumentCheckpoints:54,futureReviewCheckpoints:54,networkCalls:0}))assert.equal(acceptance[key],value,key);
writeFileSync(join(consumer,'entry.mjs'),'export {SharedServerLogGenerationParticipantInventory,readSharedServerLogGenerationParticipantInventory} from "@breditor/collaboration";');
const output=await build({configFile:false,root:consumer,logLevel:'error',build:{target:'es2022',write:false,minify:false,lib:{entry:join(consumer,'entry.mjs'),formats:['es'],fileName:'server-generation-inventory-proof'}}}),modules=(Array.isArray(output)?output:[output]).flatMap(result=>result.output).filter(chunk=>chunk.type==='chunk').flatMap(chunk=>Object.keys(chunk.modules));
for(const path of ['server_generation_inventory/read.js','server_generation_inventory/identity.js','server_generation_inventory/mixed_coverage.js','room_participant_inventory/native_cut.js','room_participant_inventory/generation_coverage.js'])assert.ok(modules.some(name=>name.includes('/node_modules/@breditor/collaboration/dist/'+path)),path);
assert.ok(!modules.some(name=>name.includes(join(root,'packages'))||name.includes('/node_modules/react/')||name.includes('fake-indexeddb')));assert.deepEqual(sourceEvidence(root),source);for(const file of native.files)assert.deepEqual(fileEvidence(root,file.path),file);
const report={format:'breditor/server-generation-inventory-installed-consumer',passed:true,source,sourceUnchanged:true,nativeEvidence:fileEvidence(root,nativePath),consumer,workspaceLinks:false,strictPublicTypes:true,registryArtifacts,archives:packs.map((pack,index)=>({name:pack.name,path:paths[index],sha256:sha(readFileSync(paths[index]))})),acceptance,sourceProbeSha256:sha(original),installedProbeSha256:sha(probe),sharedWasmSha256:sha(readFileSync(join(runtime,'breditor_shared_bg.wasm'))),productionModuleCount:modules.length,noWorkspaceReactOrSyntheticStorageInProduction:true,scope:'Fresh offline public packages and exact-source native fixture data. Identical assertions run on genuine installed native Wasm and original/generation client owners. Complete physical selections remain pinned. No browser durability, full provider/client closure, catalog activation or V1 approval.'};
saveEvidence(join(root,'target/server-generation-inventory-installed.json'),report);console.log(JSON.stringify(report,null,2));
