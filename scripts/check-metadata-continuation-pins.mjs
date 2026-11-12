/** Complete compact metadata DATA, exact retained bodies and actual live-journal
 * workset, in source or independently installed SDKs. No browser durability claim. */
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname,relative,resolve} from 'node:path';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';

const mode=process.argv[2];assert.equal(process.argv.length,3);assert.ok(['--source','--installed'].includes(mode));
const root=resolve(new URL('../',import.meta.url).pathname),source=sourceEvidence(root);assert.equal(source.dirty,false,'Commit the exact candidate before qualification');
const sha=data=>createHash('sha256').update(data).digest('hex');
const tests=['scripts/metadata-continuation-pins.test.mjs','scripts/metadata-continuation-pin-archives.test.mjs','scripts/metadata-continuation-pins-native.test.mjs'];
const types=['scripts/fixtures/metadata-pins/types.mts','scripts/fixtures/metadata-continuation/types.mts'];
const expectedCases=32,folders=['breditor-browser','breditor-experimental-rich-content','breditor-collaboration'];
// Literal resources are copied explicitly; imports alone cannot discover these.
const paths=['scripts/fixtures/metadata-pins/actual-evidence.json.gz','scripts/fixtures/metadata-pins/provenance.json','crates/breditor-core/tests/fixtures/rich-local-root.json',
 'target/owned-history-relay-native/release/examples/complete_cohort_control_functional',
 'target/owned-history-relay-native/release/examples/selected_suggestion_delivery_functional',
 'target/native-joint-process-native/debug/examples/native_joint_process_recovery_functional','target/native-joint-process-native-build.json',
 ...fs.readdirSync(join(root,'target/promoted-shared-web')).map(name=>'target/promoted-shared-web/'+name)];
const inputs=paths.map(path=>({path,bytes:fs.readFileSync(join(root,path)),mode:fs.statSync(join(root,path)).mode}));
assert.equal(sha(inputs.find(row=>row.path.endsWith('actual-evidence.json.gz')).bytes),'249dfff5db4e351e386043f544abecb70c3badffe6eb8c99a7245ee97c7e7754');
const provenance=JSON.parse(inputs.find(row=>row.path.endsWith('provenance.json')).bytes);
assert.equal(provenance.sha256,'957c6c90c9ac9d73b26ce8d101842cff0d58783279581eb1239aae6b97205eef');
const build=JSON.parse(inputs.find(row=>row.path.endsWith('native-joint-process-native-build.json')).bytes);
assert.equal(build.complete,true);assert.equal(build.exitCode,0);assert.equal(build.sourceUnchanged,true);
const executablePins=new Map([
 ['complete_cohort_control_functional','3a52eea28153ff72fda020ff6b1bb8165ee899bba32f7ec063ea84a03d2dd616'],
 ['selected_suggestion_delivery_functional','60427bb794f52c39a7084fac797f8f3150501238c45c78bad6195cd928a252ca'],
 ['native_joint_process_recovery_functional','70d9e8becba4421be4fdfb33b5d08b7ba2efc7d36c5ca521c287104e4ebc8347'],
]);
for(const row of inputs.filter(row=>row.path.includes('/examples/')))assert.equal(sha(row.bytes),executablePins.get(row.path.split('/').at(-1)));
assert.equal(sha(inputs.find(row=>row.path==='target/promoted-shared-web/breditor_shared_bg.wasm').bytes),'165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0');
const mapping=new Map(folders.map(folder=>[folder,JSON.parse(fs.readFileSync(join(root,'packages',folder,'package.json'))).name]));
const generatedOutput=JSON.parse(execFileSync(process.execPath,['scripts/check-generated-package-output.mjs'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024}));assert.equal(generatedOutput.passed,true);
const directory=fs.mkdtempSync(join(fs.realpathSync(tmpdir()),'breditor-metadata-pins-'+mode.slice(2)+'-'));
const consumer=mode==='--source'?root:join(directory,'consumer'),copied=[],archives=[];let registryArtifacts=0;

if(mode==='--installed'){
 const archiveDirectory=join(directory,'archives');fs.mkdirSync(archiveDirectory);fs.mkdirSync(consumer);
 const packs=JSON.parse(execFileSync('npm',['pack','--offline','--ignore-scripts','--json','--pack-destination',archiveDirectory,...folders.map(folder=>join(root,'packages',folder))],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}));
 const producer=JSON.parse(fs.readFileSync(join(root,'package-lock.json'))),locked=searchConsumerLock(producer,packs.map(pack=>({name:pack.name,path:join(archiveDirectory,pack.filename)})));
 locked.manifest.dependencies.undici=producer.packages['node_modules/undici'].version;
 fs.writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));fs.writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));
 execFileSync('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
 registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(fs.readFileSync(join(consumer,'package-lock.json'))));
 for(const name of mapping.values())assert.ok(fs.realpathSync(join(consumer,'node_modules',name)).startsWith(consumer+'/node_modules/'),'No workspace SDK links');
 const seen=new Set();
 function copyScript(path){
  if(seen.has(path))return;seen.add(path);
  const original=fs.readFileSync(join(root,path),'utf8'),target=join(consumer,path),rewrites=[];
  const text=original.replace(/(['"])((?:\.\.\/)+)packages\/(breditor-[^/]+)\/([^'"]+)\1/g,(from,quote,_prefix,folder,tail)=>{
   const name=mapping.get(folder);assert.ok(name,folder);let location=relative(dirname(target),join(consumer,'node_modules',name,tail));
   if(!location.startsWith('.'))location='./'+location;if(tail.endsWith('/')&&!location.endsWith('/'))location+='/';
   const to=quote+location+quote;rewrites.push([from,to]);return to;
  });
  let reversed=text;for(const[from,to]of rewrites.toReversed())reversed=reversed.replaceAll(to,from);assert.equal(reversed,original);
  assert.equal(text.includes(root),false);assert.equal(text.includes('/Users/s/'),false);assert.equal(/(?:\.\.\/)+packages\/breditor-/.test(text),false);
  fs.mkdirSync(dirname(target),{recursive:true});fs.writeFileSync(target,text);copied.push({path,sourceSha256:sha(original),installedSha256:sha(text),reversibleModuleLocationsOnly:true});
  for(const hit of original.matchAll(/['"](\.[^'"]+\.mjs)['"]/g)){
   const dependency=resolve(dirname(join(root,path)),hit[1]);if(dependency.startsWith(root+'/scripts/')&&fs.existsSync(dependency))copyScript(relative(root,dependency));
  }
 }
 for(const path of [...tests,...types])copyScript(path);
 for(const row of inputs){const path=join(consumer,row.path);fs.mkdirSync(dirname(path),{recursive:true});fs.writeFileSync(path,row.bytes,{mode:row.mode});}
 for(const pack of packs){const path=join(archiveDirectory,pack.filename);archives.push({name:pack.name,path,sha256:sha(fs.readFileSync(path))});}
}

function packageManifest(){
 const rows=[];
 for(const[folder,name]of mapping){
  const from=join(root,'packages',folder,'dist'),to=mode==='--source'?from:join(consumer,'node_modules',name,'dist');
  function files(base,path=''){return fs.readdirSync(join(base,path),{withFileTypes:true}).flatMap(child=>{const next=join(path,child.name);assert.ok(!child.isSymbolicLink());return child.isDirectory()?files(base,next):(assert.ok(child.isFile()),[next]);});}
  const paths=files(from).sort();assert.deepEqual(files(to).sort(),paths);
  for(const path of paths){const data=fs.readFileSync(join(from,path));assert.equal(sha(data),sha(fs.readFileSync(join(to,path))));rows.push({package:name,path,bytes:data.length,sha256:sha(data)});}
 }
 return rows;
}
const before=packageManifest();assert.equal(before.length,2943);
const normalWasmSha256=before.find(row=>row.package==='@breditor/collaboration'&&row.path==='runtime/breditor_shared_bg.wasm').sha256;
assert.equal(normalWasmSha256,'165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0');
const state={format:'breditor/metadata-continuation-pins-workset',formatVersion:1,mode,source,directory,consumer,generatedOutput,copied,archives,registryArtifacts,literalResources:inputs.map(row=>({path:row.path,bytes:row.bytes.length,sha256:sha(row.bytes)})),workspaceSdkLinks:mode==='--source'?null:false,matchingPackageDistFiles:before.length,packageManifestSha256:sha(JSON.stringify(before)),normalWasmSha256,complete:false,releaseReady:false,physicalReadFaultRepaired:false};
saveEvidence(join(directory,'running.json'),state);
const prefix=join(root,'target/metadata-pins-'+mode.slice(2));saveEvidence(prefix+'-running.json',{directory,consumer});
let child,timer,killTimer,stop;
const interrupted=()=>{stop?.('SIGTERM');killTimer??=setTimeout(()=>stop?.('SIGKILL'),10000);};
process.once('SIGTERM',interrupted);process.once('SIGINT',interrupted);
try{
 const output=execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','es2022','--module','nodenext','--moduleResolution','nodenext','--lib','es2022,dom,dom.iterable','--skipLibCheck','false',...types],{cwd:consumer,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
 fs.writeFileSync(join(directory,'types.log'),output);
 const path=join(directory,'contracts.log'),fd=fs.openSync(path,'wx');child=spawn(process.execPath,['--test','--test-concurrency=1',...tests],{cwd:consumer,stdio:['ignore',fd,fd],detached:true});fs.closeSync(fd);
 stop=signal=>{if(child.exitCode===null&&child.signalCode===null)try{process.kill(-child.pid,signal);}catch(error){if(error.code!=='ESRCH')throw error;}};
 let timedOut=false;timer=setTimeout(()=>{timedOut=true;stop('SIGTERM');killTimer=setTimeout(()=>stop('SIGKILL'),10000);},7500000);
 const execution=await new Promise((done,fail)=>{child.once('error',fail);child.once('exit',(code,signal)=>done({pid:child.pid,code,signal}));});clearTimeout(timer);clearTimeout(killTimer);
 saveEvidence(join(directory,'exit.json'),execution);assert.equal(timedOut,false);assert.equal(execution.code,0,'Read '+path);assert.equal(execution.signal,null);
 const log=fs.readFileSync(path,'utf8');for(const[key,n]of[['tests',expectedCases],['pass',expectedCases],['fail',0],['skipped',0],['cancelled',0],['todo',0]])assert.match(log,new RegExp('^# '+key+' '+n+'$','m'));
 assert.deepEqual(sourceEvidence(root),source);assert.deepEqual(packageManifest(),before);for(const row of inputs){assert.equal(sha(fs.readFileSync(join(root,row.path))),sha(row.bytes));assert.equal(sha(fs.readFileSync(join(consumer,row.path))),sha(row.bytes));}
 assert.match(log,/CONTINUATION_PINS_NATIVE /);
 Object.assign(state,{complete:true,passed:true,cases:expectedCases,strictPrivateTypeContracts:2,sourceUnchanged:true,packageBytesUnchanged:true,log:path,logSha256:sha(log),scope:'Compact DATA, exact archived snapshot bytes, and live re-admission of six actual interrupted/completed metadata phases under original leases. Seven Native families, three local metadata lanes, unchanged source and future document/comment histories. Not a compact restart coordinator, physical durability, process-death composition, historical WebKit fault repair or V1 qualification.'});
 saveEvidence(join(directory,'result.json'),state);saveEvidence(prefix+'-result.json',state);
 console.log(JSON.stringify({directory,passed:true,cases:expectedCases,matchingPackageDistFiles:before.length}));
}catch(error){saveEvidence(join(directory,'failed.json'),{...state,complete:true,passed:false,error:String(error)});throw error;}
finally{clearTimeout(timer);clearTimeout(killTimer);process.off('SIGTERM',interrupted);process.off('SIGINT',interrupted);}
