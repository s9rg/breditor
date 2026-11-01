/** Independently installed all-family original receipt containment, plus every
 * original catalog/packet case. Native ACKs and histories are genuine; the
 * omitted response page is an explicit controlled transport fault. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length!==2)throw Error('All original metadata cases and real Native hosts are mandatory');
const source=sourceEvidence(root),directory=fs.mkdtempSync('/private/tmp/breditor-server-packet-recovery-installed-'),archives=join(directory,'archives'),consumer=join(directory,'consumer'),sha=value=>createHash('sha256').update(value).digest('hex');
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
const tests=['server-packet-closure-contracts.test.mjs','server-packet-source-native.test.mjs','metadata-receipt-comparison-native.test.mjs','metadata-packet-archive-native.test.mjs','server-packet-recovery-native.test.mjs','server-metadata-page-contracts.test.mjs','server-metadata-packet-contracts.test.mjs','server-metadata-generation-native.test.mjs','server-metadata-version-native.test.mjs','server-metadata-physical-native.test.mjs','server-metadata-collection-native.test.mjs','server-metadata-packets-native.test.mjs'];
for(const test of tests)copyScript('scripts/'+test);
const types=['scripts/fixtures/editor-consumer/types-server-metadata.ts','scripts/fixtures/editor-consumer/types-local-metadata-receipt-containment.ts','scripts/fixtures/editor-consumer/types-local-metadata-packet-recovery.ts','scripts/fixtures/editor-consumer/types-server-packet-recovery.ts'];for(const file of types)copyScript(file);
for(const path of ['crates/breditor-core/tests/fixtures/rich-local-root.json','scripts/fixtures/local-metadata/v1-materialized-rasters.archive']){const from=join(root,path),to=join(consumer,path);fs.mkdirSync(dirname(to),{recursive:true});fs.copyFileSync(from,to);assert.equal(sha(fs.readFileSync(from)),sha(fs.readFileSync(to)));copied.push({path,sourceSha256:sha(fs.readFileSync(from)),installedSha256:sha(fs.readFileSync(to))});}
const native=[];
for(const target of ['server-metadata-native','server-native-dependencies-native'])for(const name of ['selected_suggestion_delivery_functional','complete_cohort_control_functional']){
 const path='target/'+target+'/release/examples/'+name,from=join(root,path),to=join(consumer,path);fs.mkdirSync(dirname(to),{recursive:true});fs.copyFileSync(from,to);assert.equal(sha(fs.readFileSync(to)),sha(fs.readFileSync(from)));native.push({path,sha256:sha(fs.readFileSync(from))});
}
const wasm=join(consumer,'node_modules/@breditor/collaboration/dist/runtime/breditor_shared_bg.wasm'),normalWasmSha256=sha(fs.readFileSync(wasm));assert.equal(normalWasmSha256,'165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0');
const compiler=join(root,'node_modules/typescript/bin/tsc'),compilerSha256=sha(fs.readFileSync(compiler));
const state={format:'breditor/client-server-packet-recovery-installed-consumer',formatVersion:1,complete:false,source,sourceRoot:root,directory,consumer,workspaceLinks:false,registryArtifacts,copied,native,normalWasmSha256,compilerSha256,archives:packed.map(pack=>({name:pack.name,path:join(archives,pack.filename),sha256:sha(fs.readFileSync(join(archives,pack.filename)))})),releaseReady:false,v1GatesOpen:13};
saveEvidence(join(directory,'running.json'),state);console.log(JSON.stringify({directory,phase:'strict-public-types-and-genuine-all-family-receipt-containment'}));
try{
 const typesLog=execFileSync(process.execPath,[compiler,'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM',...types],{cwd:consumer,encoding:'utf8',maxBuffer:4*1024*1024,timeout:120000});
 fs.writeFileSync(join(directory,'types.log'),typesLog);
 const log=execFileSync(process.execPath,['--test','--test-concurrency=1',...tests.map(test=>'scripts/'+test)],{cwd:consumer,encoding:'utf8',maxBuffer:8*1024*1024,timeout:7200000});fs.writeFileSync(join(directory,'contracts.log'),log);
 for(const[key,n]of [['tests',33],['pass',33],['fail',0],['skipped',0],['cancelled',0],['todo',0]])assert.match(log,new RegExp('^# '+key+' '+n+'$','m'));
 assert.deepEqual(sourceEvidence(root),source);assert.equal(sha(fs.readFileSync(compiler)),compilerSha256);for(const row of native)assert.equal(sha(fs.readFileSync(join(root,row.path))),row.sha256);
 Object.assign(state,{complete:true,passed:true,tests:33,sourceUnchanged:true,strictPublicTypes:true,log:join(directory,'contracts.log'),logSha256:sha(log),scope:'Complete client/server Native packet and raster union, actual seven lagged Native readers with original Pending preserved while the genuine server supplies the missing source, all original first-server/lossless local strings, full original seven-family packet/asset/server-file workflow followed by the additional owner capture and exact disk readback. Original managed asset ACKs and all-seven-family original protocol delivery; held original receipt comparison over live, saved, original and restored-input states; omission remains Pending despite checked outboxes. Twelve focused original-fact comparison cases include a Native-valid packet byte variant, cached catalog, changed/missing receipts, server rollback, bindings and actual conflict successor. All twenty-one earlier original catalog/packet checks are also mandatory. No receipt installation, queue settlement, writer grant or whole-room activation claim.'});
 saveEvidence(join(directory,'result.json'),state);saveEvidence(join(root,'target/client-server-packet-recovery-installed-consumer.json'),state);console.log(JSON.stringify({directory,passed:true,tests:33,workspaceLinks:false,sourceUnchanged:true}));
}catch(error){
 if(error.stdout)fs.writeFileSync(join(directory,'failed-stdout.log'),error.stdout);if(error.stderr)fs.writeFileSync(join(directory,'failed-stderr.log'),error.stderr);
 saveEvidence(join(directory,'failed.json'),{...state,error:String(error)});throw error;
}
