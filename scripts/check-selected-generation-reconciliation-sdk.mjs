/** Exact-source selected generation native reconciliation and unchanged physical laws. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,openSync,closeSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {NORMAL_SHARED_WASM_SHA256} from './fixtures/native-runtime/normal-shared-identity.mjs';
import {selectedGenerationReconciliationWorkload as workload} from './selected-generation-reconciliation-workload.mjs';
if(process.argv.length!==2)throw Error('No reduced assertions or substituted native/runtime inputs accepted');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),cargo=process.env.BREDITOR_CARGO??process.env.CARGO_BIN??join(homedir(),'.cargo/bin/cargo'),target=join(root,'target/owned-history-relay-native'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const examples=['generation_complete_control_functional','complete_cohort_control_functional'];for(const name of examples)execFileSync(cargo,['build','--manifest-path','experiments/relay/Cargo.toml','--locked','--offline','--release','--features','server','--example',name],{cwd:root,env:{...process.env,CARGO_TARGET_DIR:target},stdio:'inherit'});
const binaries=examples.map(name=>({path:join(target,'release/examples',name),sha256:sha(readFileSync(join(target,'release/examples',name)))}));assert.equal(sha(readFileSync(join(root,'packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm'))),NORMAL_SHARED_WASM_SHA256);
const directory=mkdtempSync(join(root,'target/selected-generation-reconciliation-sdk-')),log=join(directory,'contracts.log'),fd=openSync(log,'wx',0o600);console.log('CONTRACT_LOG',log);
try{execFileSync(process.execPath,['--test','--test-concurrency=2',...workload.tests.map(name=>'scripts/'+name)],{cwd:root,stdio:['ignore',fd,fd],timeout:10800000});}finally{closeSync(fd);}
const output=readFileSync(log,'utf8');assert.ok(Buffer.byteLength(output)<=16*1024*1024);for(const[mark,value]of [['tests',workload.assertions],['pass',workload.assertions],['fail',0],['skipped',0],['cancelled',0]])assert.match(output,new RegExp('^# '+mark+' '+value+'$','m'));assert.deepEqual(sourceEvidence(root),source);for(const binary of binaries)assert.equal(sha(readFileSync(binary.path)),binary.sha256);
const report={format:'breditor/selected-generation-reconciliation-sdk',formatVersion:1,passed:true,source,directory,sourceUnchanged:true,assertions:workload.assertions,newSelectedGenerationAssertions:workload.newSelectedGenerationAssertions,migratedOriginAssertions:workload.migratedOriginAssertions,priorPhysicalSelectedAssertions:38,priorParentProviderAssertions:68,selectedGenerationConfigurations:40,selectedGenerationFamiliesPerCase:7,selectedGenerationColdUndoRedoClients:280,binaries,normalWasmSha256:NORMAL_SHARED_WASM_SHA256,scope:workload.scope};saveEvidence(join(directory,'result.json'),report);saveEvidence(join(root,'target/selected-generation-reconciliation-sdk.json'),report);console.log(JSON.stringify(report));
