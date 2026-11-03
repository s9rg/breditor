/** Independent packages exercise the actual SDK-triggered native publication,
 * durable uncertain outcomes, cold offline work and exact future histories. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {nativePublicationTests as tests,nativePublicationTypes as types,nativePublicationData as data,nativePublicationCaseCount as count,nativePublicationTimeoutMs,nativePublicationBuildReport} from './sdk-native-publication-plan.mjs';
import {checkSdkNativePublicationEvidence} from './sdk-native-publication-evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length!==2)throw Error('All complete SDK native publication cases are mandatory');
const source=sourceEvidence(root),directory=fs.mkdtempSync('/private/tmp/breditor-sdk-native-publication-installed-'),archives=join(directory,'archives'),consumer=join(directory,'consumer'),sha=value=>createHash('sha256').update(value).digest('hex');
fs.mkdirSync(archives);fs.mkdirSync(consumer);
const packages=['breditor-browser','breditor-experimental-rich-content','breditor-collaboration'],mapping=new Map(packages.map(name=>[name,JSON.parse(fs.readFileSync(join(root,'packages',name,'package.json'))).name]));
const packed=JSON.parse(execFileSync('npm',['pack','--offline','--ignore-scripts','--json','--pack-destination',archives,...packages.map(name=>join(root,'packages',name))],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}));
const producer=JSON.parse(fs.readFileSync(join(root,'package-lock.json'))),locked=searchConsumerLock(producer,packed.map(pack=>({name:pack.name,path:join(archives,pack.filename)})));
locked.manifest.dependencies.undici=producer.packages['node_modules/undici'].version;
fs.writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));fs.writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));
execFileSync('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(fs.readFileSync(join(consumer,'package-lock.json'))));
for(const name of mapping.values())assert.ok(fs.realpathSync(join(consumer,'node_modules',name)).startsWith(fs.realpathSync(consumer)+'/node_modules/'));
const copied=[],seen=new Set();
function copyScript(path){
 if(seen.has(path))return;seen.add(path);const original=fs.readFileSync(join(root,path),'utf8'),target=join(consumer,path),rewrites=[];
 const text=original.replace(/(['"])((?:\.\.\/)+)packages\/(breditor-[^/]+)\/([^'"]+)\1/g,(from,quote,_prefix,folder,tail)=>{
  const name=mapping.get(folder);assert.ok(name);let location=relative(dirname(target),join(consumer,'node_modules',name,tail));if(!location.startsWith('.'))location='./'+location;if(tail.endsWith('/')&&!location.endsWith('/'))location+='/';const to=quote+location+quote;rewrites.push([from,to]);return to;
 }).replace(/(['"])packages\/(breditor-[^/]+)\/([^'"]+)\1/g,(from,quote,folder,tail)=>{const name=mapping.get(folder);assert.ok(name);const to=quote+'node_modules/'+name+'/'+tail+quote;rewrites.push([from,to]);return to;});
 let reversed=text;for(const[from,to]of rewrites.toReversed())reversed=reversed.replaceAll(to,from);assert.equal(reversed,original,'Only reversible installed module locations may change');
 assert.equal(text.includes('/Users/s/'),false);assert.equal(/(?:\.\.\/)+packages\/breditor-/.test(text),false);
 fs.mkdirSync(dirname(target),{recursive:true});fs.writeFileSync(target,text);copied.push({path,sourceSha256:sha(original),installedSha256:sha(text),reversibleModuleLocationsOnly:true});
 for(const hit of original.matchAll(/['"](\.[^'"]+\.mjs)['"]/g)){const dependency=resolve(dirname(join(root,path)),hit[1]);if(dependency.startsWith(root+'/scripts/')&&fs.existsSync(dependency))copyScript(relative(root,dependency));}
}
for(const test of tests)copyScript('scripts/'+test);
for(const file of types)copyScript(file);
for(const path of data){const from=join(root,path),to=join(consumer,path);fs.mkdirSync(dirname(to),{recursive:true});fs.copyFileSync(from,to);assert.equal(sha(fs.readFileSync(from)),sha(fs.readFileSync(to)));copied.push({path,sourceSha256:sha(fs.readFileSync(from)),installedSha256:sha(fs.readFileSync(to))});}
const build=JSON.parse(fs.readFileSync(join(root,nativePublicationBuildReport)));assert.equal(build.complete,true);assert.equal(build.exitCode,0);assert.deepEqual(build.source,source);for(const row of build.binaries)assert.equal(sha(fs.readFileSync(row.path)),row.sha256);
const native=[];
for(const target of ['sdk-native-publication-native'])for(const name of ['native_publication_sdk_functional']){
 const path='target/'+target+'/debug/examples/'+name,from=join(root,path),to=join(consumer,path);fs.mkdirSync(dirname(to),{recursive:true});fs.copyFileSync(from,to);assert.equal(sha(fs.readFileSync(to)),sha(fs.readFileSync(from)));native.push({path,sha256:sha(fs.readFileSync(from))});
}
const wasm=join(consumer,'node_modules/@breditor/collaboration/dist/runtime/breditor_shared_bg.wasm'),normalWasmSha256=sha(fs.readFileSync(wasm));assert.equal(normalWasmSha256,'165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0');
const distributionFiles=[];
function inventory(base){const names=[];function walk(path){for(const entry of fs.readdirSync(join(base,path),{withFileTypes:true})){const next=join(path,entry.name);if(entry.isDirectory())walk(next);else{assert.ok(entry.isFile(),'Distribution cannot contain symbolic/special files');names.push(next);}}}walk('dist');return names.sort();}
for(const [folder,name]of mapping){const producerPackage=join(root,'packages',folder),installedPackage=join(consumer,'node_modules',name),expected=inventory(producerPackage);assert.deepEqual(inventory(installedPackage),expected);for(const path of expected){const sourceBytes=fs.readFileSync(join(producerPackage,path)),bytes=fs.readFileSync(join(installedPackage,path));assert.equal(sha(bytes),sha(sourceBytes));distributionFiles.push({package:name,path,bytes:bytes.length,sha256:sha(bytes)});}}
const compiler=join(root,'node_modules/typescript/bin/tsc'),compilerSha256=sha(fs.readFileSync(compiler));
const state={format:'breditor/sdk-native-publication-installed-consumer',formatVersion:1,complete:false,source,sourceRoot:root,directory,consumer,workspaceLinks:false,registryArtifacts,copied,native,distributionFiles,matchingDistributionFiles:distributionFiles.length,normalWasmSha256,compilerSha256,archives:packed.map(pack=>({name:pack.name,path:join(archives,pack.filename),sha256:sha(fs.readFileSync(join(archives,pack.filename)))})),releaseReady:false,v1GatesOpen:13};
saveEvidence(join(directory,'running.json'),state);console.log(JSON.stringify({directory,phase:'strict-types-and-genuine-sdk-native-publication'}));
try{
 const typesLog=execFileSync(process.execPath,[compiler,'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM',...types],{cwd:consumer,encoding:'utf8',maxBuffer:4*1024*1024,timeout:120000});
 fs.writeFileSync(join(directory,'types.log'),typesLog);
 const logPath=join(directory,'contracts.log'),fd=fs.openSync(logPath,'wx');let execution;try{execution=spawnSync(process.execPath,['--test','--test-concurrency=1',...tests.map(test=>'scripts/'+test)],{cwd:consumer,stdio:['ignore',fd,fd],timeout:nativePublicationTimeoutMs});}finally{fs.closeSync(fd);}assert.equal(execution.error,undefined);assert.equal(execution.status,0,'Read '+logPath);assert.ok(fs.statSync(logPath).size<=8*1024*1024);const log=fs.readFileSync(logPath,'utf8');
 checkSdkNativePublicationEvidence(log);
 for(const[key,n]of [['tests',count],['pass',count],['fail',0],['skipped',0],['cancelled',0],['todo',0]])assert.match(log,new RegExp('^# '+key+' '+n+'$','m'));
 assert.deepEqual(sourceEvidence(root),source);assert.equal(sha(fs.readFileSync(compiler)),compilerSha256);for(const row of native)assert.equal(sha(fs.readFileSync(join(root,row.path))),row.sha256);
 Object.assign(state,{complete:true,passed:true,tests:count,sourceUnchanged:true,strictPrivateTypes:true,log:join(directory,'contracts.log'),logSha256:sha(log),scope:'Actual SDK HTTP activation and normal publication retain seven cold owners, fourteen original offline document/comment suffixes, complete intent bytes and exact future histories. Lost actual replies require explicit same-owner retries. IPC provisions and observes only. Local actor transfer/joint metadata continuation, physical storage, complete policy matrices and V1 readiness remain separate.'});
 saveEvidence(join(directory,'result.json'),state);saveEvidence(join(root,'target/sdk-native-publication-installed-consumer.json'),state);console.log(JSON.stringify({directory,passed:true,tests:count,workspaceLinks:false,sourceUnchanged:true}));
}catch(error){
 if(error.stdout)fs.writeFileSync(join(directory,'failed-stdout.log'),error.stdout);if(error.stderr)fs.writeFileSync(join(directory,'failed-stderr.log'),error.stderr);
 saveEvidence(join(directory,'failed.json'),{...state,error:String(error)});throw error;
}
