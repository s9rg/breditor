/** Actual offline archives and public paired runtime; no workspace SDK import.
 * Builds/tests no browser UI and grants no V1, activation or publication approval. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,realpathSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
import {checkApplicationRuntime} from './check-collaboration-runtime-surface.mjs';
if(process.argv.length!==2)throw Error('Usage: node scripts/check-writer-prefix-installed.mjs; requires freshly built canonical runtimes; never publishes');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),directory=mkdtempSync('/private/tmp/breditor-writer-prefix-installed-'),archives=join(directory,'archives'),consumer=join(directory,'consumer');
const npm=process.env.BREDITOR_NPM??process.env.NPM_BIN??'npm',sha=bytes=>createHash('sha256').update(bytes).digest('hex');mkdirSync(archives);mkdirSync(consumer);
const put=(name,text)=>writeFileSync(join(consumer,name),text),run=(name,command,args,cwd=consumer)=>{const output=execFileSync(command,args,{cwd,encoding:'utf8',maxBuffer:8*1024*1024});writeFileSync(join(directory,name+'.log'),output);return output;};
try{
 const names=['@breditor/browser','@breditor/experimental-rich-content','@breditor/collaboration'];
 const packs=JSON.parse(run('pack',npm,['pack','--offline','--ignore-scripts','--json','--pack-destination',archives,...names.flatMap(name=>['--workspace',name])],root)),paths=packs.map(row=>join(archives,row.filename));
 const producer=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8')),locked=searchConsumerLock(producer,packs.map((row,i)=>({name:row.name,path:paths[i]})));put('package.json',JSON.stringify(locked.manifest));put('package-lock.json',JSON.stringify(locked.lock));
 run('install',npm,['install','--offline','--ignore-scripts','--no-audit','--no-fund']);const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(readFileSync(join(consumer,'package-lock.json'),'utf8')));
 for(const name of names)assert.ok(realpathSync(join(consumer,'node_modules',name)).startsWith(realpathSync(consumer)+'/node_modules/'),'No workspace link may supply a consumer');
 const runtime=join(consumer,'node_modules/@breditor/collaboration/dist/runtime'),wasmSha256=sha(readFileSync(join(runtime,'breditor_shared_bg.wasm')));
 assert.equal(wasmSha256,sha(readFileSync(join(root,'target/promoted-shared-web/breditor_shared_bg.wasm'))));
 const surface=await checkApplicationRuntime(runtime),inventory=JSON.parse(readFileSync(join(runtime,'breditor_dependency_inventory.json'),'utf8'));
 assert.equal(inventory.runtimeWasmSha256,wasmSha256);assert.equal(inventory.cargoLockSha256,sha(readFileSync(join(root,'crates/breditor-collaboration/Cargo.lock'))));assert.equal(inventory.noticeBundleSha256,sha(readFileSync(join(runtime,'THIRD_PARTY_NOTICES.txt'))));
 copyFileSync(join(root,'scripts/fixtures/editor-consumer/types-writer-prefix.ts'),join(consumer,'types-writer-prefix.ts'));
 run('types',process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM,ESNext.Disposable','types-writer-prefix.ts']);
 const laws=readFileSync(join(root,'scripts/fixtures/writer-prefix/laws.mjs'),'utf8');put('laws.mjs',laws);copyFileSync(join(root,'crates/breditor-core/tests/fixtures/rich-local-root.json'),join(consumer,'document-root.json'));
 const script=entry=>`import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import*as sdk from ${JSON.stringify(entry)};import*as native from'@breditor/collaboration/wasm';import{writerPrefixLaws}from'./laws.mjs';await native.default({module_or_path:readFileSync(new URL(import.meta.resolve('@breditor/collaboration/wasm-binary')))});const result=await writerPrefixLaws({sdk,native,documentRoot:JSON.parse(readFileSync(new URL('./document-root.json',import.meta.url),'utf8'))});assert.equal(result.queries,120);assert.equal(result.cases,12);assert.equal(result.coldRestores,12);assert.equal(result.futureHistorySteps,24);console.log(JSON.stringify(result));\n`;
 put('installed.mjs',script('@breditor/collaboration'));const installed=JSON.parse(run('installed',process.execPath,['installed.mjs']));
 put('entry.mjs',"export{SharedRichEditor}from'@breditor/collaboration';\n");
 const {build}=await import(pathToFileURL(join(root,'node_modules/vite/dist/node/index.js')).href),output=await build({configFile:false,root:consumer,logLevel:'error',build:{target:'es2022',write:false,minify:false,lib:{entry:join(consumer,'entry.mjs'),formats:['es'],fileName:'writer-prefix'},rollupOptions:{output:{inlineDynamicImports:true}}}});
 const chunks=(Array.isArray(output)?output:[output]).flatMap(row=>row.output).filter(row=>row.type==='chunk');assert.equal(chunks.length,1);const modules=Object.keys(chunks[0].modules);
 assert.ok(modules.some(path=>path.endsWith('/node_modules/@breditor/collaboration/dist/core.js')));assert.ok(!modules.some(path=>path.includes(join(root,'packages'))||path.includes('/node_modules/react/')||path.includes('fake-indexeddb')));
 put('bundle.mjs',chunks[0].code);put('bundled.mjs',script('./bundle.mjs'));const bundled=JSON.parse(run('bundled',process.execPath,['bundled.mjs']));
 assert.deepEqual(bundled,installed);assert.deepEqual(sourceEvidence(root),source);
 const result={format:'breditor/writer-prefix-installed-consumer',formatVersion:1,passed:true,source,sourceUnchanged:true,directory,consumer,workspaceLinks:false,registryArtifacts,wasmSha256,surface,strictPublicTypes:true,archives:packs.map((row,i)=>({name:row.name,path:paths[i],sha256:sha(readFileSync(paths[i]))})),unchangedLawsSha256:sha(laws),installed,productionBundle:{...bundled,modules:modules.length,sha256:sha(chunks[0].code),workspaceModules:false},scope:'Actual offline installed public SDK and paired canonical Rust/Wasm plus its public production-bundled facade; all six profiles and both native history policies read original/V2 peer/genesis prefixes, preserve bytes and future Undo/Redo. Exact-source native tests and wrong-author/legacy-runtime regression are separate. No room provider/registered-stream reconciliation, activation, full cumulative-current-runtime regression or V1 approval.'};
 saveEvidence(join(directory,'result.json'),result);saveEvidence(join(root,'target/writer-prefix-installed-consumer.json'),result);console.log(JSON.stringify(result,null,2));
}catch(error){saveEvidence(join(directory,'failure.json'),{source,directory,message:error?.message,stack:error?.stack});throw error;}
