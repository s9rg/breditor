/** Exact-source durable generation-native execution and unchanged physical laws. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,openSync,closeSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {reportNativeContractFailure,verifyNativeContractLog} from './candidate-release/native-contract-log.mjs';
import {historicalSharedWasmSha256} from './fixtures/native-runtime/shared-runtime-receipt.mjs';
import {selectSharedRuntimeBuild} from './candidate-release/shared-runtime-evidence.mjs';
import {generationNativeExecutionWorkload as workload} from './generation-native-execution-workload.mjs';
if(process.argv.length!==2)throw Error('No reduced assertions or substituted native/runtime inputs accepted');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),cargo=process.env.BREDITOR_CARGO??process.env.CARGO_BIN??join(homedir(),'.cargo/bin/cargo'),target=join(root,'target/owned-history-relay-native'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const runtime=selectSharedRuntimeBuild(root,source),normalWasmSha256=runtime?.wasmSha256??historicalSharedWasmSha256;
assert.equal(sha(readFileSync(join(root,'packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm'))),normalWasmSha256);
const examples=['generation_complete_control_functional','complete_cohort_control_functional'];
execFileSync(cargo,['build','--manifest-path','experiments/relay/Cargo.toml','--locked','--offline','--release','--features','server',...examples.flatMap(name=>['--example',name])],{cwd:root,env:{...process.env,CARGO_TARGET_DIR:target},stdio:'inherit'});
const binaries=examples.map(name=>({path:join(target,'release/examples',name),sha256:sha(readFileSync(join(target,'release/examples',name)))}));
const directory=mkdtempSync(join(root,'target/generation-native-execution-sdk-')),log=join(directory,'contracts.log'),fd=openSync(log,'wx',0o600);console.log('CONTRACT_LOG',log);
try{
 try{execFileSync(process.execPath,['--test','--test-concurrency=2',...workload.tests.map(name=>'scripts/'+name)],{cwd:root,env:{...process.env,...runtime?.environment},stdio:['ignore',fd,fd],timeout:14400000});}finally{closeSync(fd);}
 verifyNativeContractLog(log,workload.assertions);
}catch(error){reportNativeContractFailure('source',log,workload.tests);throw error;}
if(runtime)assert.equal(selectSharedRuntimeBuild(root,source)?.sha256,runtime.sha256,'Shared runtime changed during qualification');
assert.deepEqual(sourceEvidence(root),source);for(const binary of binaries)assert.equal(sha(readFileSync(binary.path)),binary.sha256);
const report={format:'breditor/generation-native-execution-sdk',formatVersion:1,passed:true,source,directory,sourceUnchanged:true,assertions:workload.assertions,newGenerationAssertions:workload.newGenerationAssertions,priorPhysicalAssertions:37,generationInputProfiles:10,independentHistoryPairs:4,selectedFamiliesPerCase:7,binaries,normalWasmSha256,sharedRuntimeReceiptSha256:runtime?.sha256,scope:workload.scope};saveEvidence(join(directory,'result.json'),report);saveEvidence(join(root,'target/generation-native-execution-sdk.json'),report);console.log(JSON.stringify(report));
