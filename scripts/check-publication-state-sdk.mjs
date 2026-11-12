import {publicationStateCompiled} from './publication-state-artifacts.mjs';
/** Normal Native Wasm, fixed complete matrix and public strict types. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import {execFileSync,spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import {resolve,join} from 'node:path';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {selectSharedRuntimeBuild} from './candidate-release/shared-runtime-evidence.mjs';
import {historicalSharedWasmSha256} from './fixtures/native-runtime/shared-runtime-receipt.mjs';
import {publicationStateTests as tests,publicationStateTypes as types,publicationStateCount as count,checkPublicationStateEvidence as check} from './publication-state-plan.mjs';
if(process.argv.length!==2)throw Error('No alternate runtime or reduced matrix accepted');
const root=process.cwd(),source=sourceEvidence(root);
const runtime=selectSharedRuntimeBuild(root,source);
const compiled=publicationStateCompiled(root),directory=fs.mkdtempSync(join(root,'target/publication-state-source-'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const normalWasmSha256=sha(fs.readFileSync(join(root,'packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm')));
assert.equal(normalWasmSha256,runtime?.wasmSha256??historicalSharedWasmSha256);
const state={format:'breditor/native-publication-state-source',formatVersion:1,complete:false,source,compiled,directory,normalWasmSha256,sharedRuntimeReceiptSha256:runtime?.sha256??null,releaseReady:false,v1GatesOpen:13};saveEvidence(join(directory,'running.json'),state);
try{
 const typesLog=execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM,ESNext.Disposable',...types],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024,timeout:120000});fs.writeFileSync(join(directory,'types.log'),typesLog);
 const logPath=join(directory,'contracts.log'),fd=fs.openSync(logPath,'wx');let result;try{result=spawnSync(process.execPath,['--test','--test-concurrency=1',...tests.map(name=>'scripts/'+name)],{cwd:root,env:{...process.env,...runtime?.environment},stdio:['ignore',fd,fd],timeout:120000});}finally{fs.closeSync(fd);}assert.equal(result.error,undefined);assert.equal(result.status,0,'Read '+logPath);const log=fs.readFileSync(logPath,'utf8');check(log);assert.deepEqual(sourceEvidence(root),source);assert.deepEqual(publicationStateCompiled(root),compiled);
 assert.deepEqual(selectSharedRuntimeBuild(root,source),runtime);
 Object.assign(state,{complete:true,passed:true,tests:count,strictPublicTypes:true,sourceUnchanged:true,log:logPath,logSha256:sha(log)});saveEvidence(join(directory,'result.json'),state);saveEvidence(join(root,'target/publication-state-source.json'),state);console.log(JSON.stringify({directory,passed:true,tests:count}));
}catch(error){saveEvidence(join(directory,'failed.json'),{...state,error:String(error)});throw error;}
