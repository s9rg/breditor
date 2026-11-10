/** Exact source or independently installed uncertainty/read-observation workset.
 * Synthetic transport failures and controlled IDB are component evidence only. */
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
const tests=['scripts/native-uncertainty-read-evidence.test.mjs','scripts/native-activation-read-refusal.test.mjs','scripts/native-activation-transport.test.mjs','scripts/native-publication-transport.test.mjs','scripts/room-native-activation-intent.test.mjs','scripts/diagnostics/archive-error-chain.test.mjs'];
const types=['scripts/fixtures/metadata-continuation/types.mts','scripts/fixtures/native-joint-reassociation/types.mts','scripts/fixtures/activation-wire/types.mts','scripts/fixtures/editor-consumer/types-room-record-cut.ts'];
const expectedCases=83,folders=['breditor-browser','breditor-experimental-rich-content','breditor-collaboration'];
const resource='scripts/fixtures/local-metadata/pending-source-packet-recovery.archive',resourceBytes=fs.readFileSync(join(root,resource));
assert.equal(sha(resourceBytes),'f49c7ed524d513b34c214fc41b7d7452eaa8cd1100d4b2817cb5afb79883ff99');
const mapping=new Map(folders.map(folder=>[folder,JSON.parse(fs.readFileSync(join(root,'packages',folder,'package.json'))).name]));
const generatedOutput=JSON.parse(execFileSync(process.execPath,['scripts/check-generated-package-output.mjs'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024}));assert.equal(generatedOutput.passed,true);
const directory=fs.mkdtempSync('/private/tmp/breditor-native-uncertainty-'+mode.slice(2)+'-');
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
 fs.mkdirSync(dirname(join(consumer,resource)),{recursive:true});fs.writeFileSync(join(consumer,resource),resourceBytes);
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
const before=packageManifest();assert.equal(before.length,2917);
const normalWasmSha256=before.find(row=>row.package==='@breditor/collaboration'&&row.path==='runtime/breditor_shared_bg.wasm').sha256;
assert.equal(normalWasmSha256,'165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0');
const state={format:'breditor/native-uncertainty-read-evidence',formatVersion:1,mode,source,directory,consumer,generatedOutput,copied,archives,registryArtifacts,literalResources:[{path:resource,bytes:resourceBytes.length,sha256:sha(resourceBytes)}],workspaceSdkLinks:mode==='--source'?null:false,matchingPackageDistFiles:before.length,packageManifestSha256:sha(JSON.stringify(before)),normalWasmSha256,complete:false,releaseReady:false,physicalReadFaultRepaired:false};
saveEvidence(join(directory,'running.json'),state);
const prefix=join(root,'target/native-uncertainty-evidence-'+mode.slice(2));saveEvidence(prefix+'-running.json',{directory,consumer});
try{
 const output=execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','es2022','--module','nodenext','--moduleResolution','nodenext','--lib','es2022,dom,dom.iterable','--skipLibCheck','false',...types],{cwd:consumer,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
 fs.writeFileSync(join(directory,'types.log'),output);
 const path=join(directory,'contracts.log'),fd=fs.openSync(path,'wx'),child=spawn(process.execPath,['--test','--test-concurrency=1',...tests],{cwd:consumer,stdio:['ignore',fd,fd]});fs.closeSync(fd);
 const timer=setTimeout(()=>child.kill('SIGTERM'),120000);let execution;
 try{execution=await new Promise((done,fail)=>{child.once('error',fail);child.once('exit',(code,signal)=>done({pid:child.pid,code,signal}));});}finally{clearTimeout(timer);}
 saveEvidence(join(directory,'exit.json'),execution);assert.equal(execution.code,0,'Read '+path);assert.equal(execution.signal,null);
 const log=fs.readFileSync(path,'utf8');for(const[key,n]of[['tests',expectedCases],['pass',expectedCases],['fail',0],['skipped',0],['cancelled',0],['todo',0]])assert.match(log,new RegExp('^# '+key+' '+n+'$','m'));
 assert.deepEqual(sourceEvidence(root),source);assert.deepEqual(packageManifest(),before);assert.equal(sha(fs.readFileSync(join(consumer,resource))),sha(resourceBytes));
 Object.assign(state,{complete:true,passed:true,cases:expectedCases,strictPrivateTypeContracts:4,sourceUnchanged:true,packageBytesUnchanged:true,log:path,logSha256:sha(log),scope:'Failure-observation mappings and existing transport/intent/diagnostic laws only. No actual Native server restart, physical short-read repair, public production or V1 qualification.'});
 saveEvidence(join(directory,'result.json'),state);saveEvidence(prefix+'-result.json',state);
 console.log(JSON.stringify({directory,passed:true,cases:expectedCases,matchingPackageDistFiles:before.length}));
}catch(error){saveEvidence(join(directory,'failed.json'),{...state,complete:true,passed:false,error:String(error)});throw error;}
