/** Bounded real SDK-triggered normal publication fixture. Historical Native
 * fixture executables and normal Wasm bytes are never overwritten. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {buildArtifactBytes} from './candidate-release/build-artifact-bytes.mjs';
if(process.argv.length!==2)throw Error('Separate Native publication build has no source/target substitution mode');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),target=join(root,'target/sdk-native-publication-native'),budgetBytes=3*1024**3,sha=value=>createHash('sha256').update(value).digest('hex');
fs.mkdirSync(join(root,'target'),{recursive:true});
const source=sourceEvidence(root),directory=fs.mkdtempSync(join(root,'target/sdk-native-publication-build-')),log=join(directory,'build.log');
const protectedFiles=['target/reconciled-packet-native/release/examples/native_activation_sdk_functional',...['selected_suggestion_delivery_functional','complete_cohort_control_functional'].map(name=>'target/reconciled-packet-native/release/examples/'+name),...['selected_suggestion_delivery_functional','complete_cohort_control_functional'].map(name=>'target/server-native-dependencies-native/release/examples/'+name),'target/server-metadata-native/release/examples/selected_suggestion_delivery_functional','target/server-metadata-native/release/examples/complete_cohort_control_functional','packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',...['selected_delivery_functional','selected_suggestion_delivery_functional','segmented_relay_functional','generation_complete_control_functional','complete_cohort_control_functional'].map(name=>'target/owned-history-relay-native/release/examples/'+name)].filter(path=>fs.existsSync(join(root,path))).map(path=>({path,sha256:sha(fs.readFileSync(join(root,path)))}));
const examples=['native_publication_sdk_functional'],args=['build','--manifest-path','experiments/relay/Cargo.toml','--features','server','--locked','--offline',...examples.flatMap(name=>['--example',name])];
const state={format:'breditor/sdk-native-publication-native-build',formatVersion:1,complete:false,source,target,budgetBytes,directory,log,command:['cargo',...args],protectedFiles};saveEvidence(join(directory,'running.json'),state);
let exceeded=false,timedOut=false,monitorError;
const localCargo=join(homedir(),'.cargo/bin/cargo'),cargo=process.env.BREDITOR_CARGO??process.env.CARGO_BIN??(fs.existsSync(localCargo)?localCargo:'cargo');
const output=fs.openSync(log,'wx'),child=spawn(cargo,args,{cwd:root,env:{...process.env,CARGO_TARGET_DIR:target,CARGO_BUILD_JOBS:'2',CARGO_INCREMENTAL:'0',CARGO_PROFILE_DEV_DEBUG:'0'},stdio:['ignore',output,output],detached:true});fs.closeSync(output);
const stop=()=>{if(!child.pid||child.exitCode!==null||child.signalCode!==null)return;try{process.kill(-child.pid,'SIGTERM');}catch{/* A concurrently completed compiler is already terminal. */}};
process.once('exit',stop);
const interval=setInterval(()=>{try{if(buildArtifactBytes(target,budgetBytes)>budgetBytes){exceeded=true;stop();}}catch(error){monitorError=error instanceof Error?error.message:String(error);stop();}},5000);
const timer=setTimeout(()=>{timedOut=true;stop();},30*60*1000);
let exitCode,spawnError;
try{exitCode=await new Promise((done,fail)=>{child.once('error',fail);child.once('exit',(code,signal)=>done(code??signal));});}
catch(error){spawnError=error instanceof Error?error.message:String(error);exitCode='spawn-error';}
finally{clearInterval(interval);clearTimeout(timer);process.removeListener('exit',stop);}
Object.assign(state,{complete:true,exitCode,spawnError,monitorError,exceeded,timedOut,sourceUnchanged:JSON.stringify(sourceEvidence(root))===JSON.stringify(source)});
for(const row of protectedFiles)assert.equal(sha(fs.readFileSync(join(root,row.path))),row.sha256);
if(exitCode===0)state.binaries=examples.map(name=>{const path=join(target,'debug/examples',name);return{path,bytes:fs.statSync(path).size,sha256:sha(fs.readFileSync(path))};});
saveEvidence(join(directory,'result.json'),state);assert.equal(exitCode,0);assert.equal(exceeded,false);assert.equal(timedOut,false);assert.equal(monitorError,undefined);assert.equal(state.sourceUnchanged,true);saveEvidence(join(root,'target/sdk-native-publication-native-build.json'),state);console.log(JSON.stringify({directory,passed:true,target,budgetBytes}));
