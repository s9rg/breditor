/** Repeat unchanged lifecycle laws from fresh offline package archives.
 * Private module locations are rewritten reversibly; native records are real. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length!==2)throw Error('No reduced lifecycle cases or substituted native runtime');
const source=sourceEvidence(root),directory=fs.mkdtempSync('/private/tmp/breditor-storage-lifecycle-installed-'),archives=join(directory,'archives'),consumer=join(directory,'consumer'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(archives);fs.mkdirSync(consumer);
const packages=['breditor-browser','breditor-experimental-rich-content','breditor-collaboration'],mapping=new Map(packages.map(name=>[name,JSON.parse(fs.readFileSync(join(root,'packages',name,'package.json'))).name]));
const packs=JSON.parse(execFileSync('npm',['pack','--offline','--ignore-scripts','--json','--pack-destination',archives,...packages.map(name=>join(root,'packages',name))],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}));
const producer=JSON.parse(fs.readFileSync(join(root,'package-lock.json'))),locked=searchConsumerLock(producer,packs.map(pack=>({name:pack.name,path:join(archives,pack.filename)})));
fs.writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));fs.writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));execFileSync('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(fs.readFileSync(join(consumer,'package-lock.json'))));for(const name of mapping.values())assert.ok(fs.realpathSync(join(consumer,'node_modules',name)).startsWith(fs.realpathSync(consumer)+'/node_modules/'));
const copied=[],seen=new Set();
function copyScript(path){
 if(seen.has(path))return;seen.add(path);const original=fs.readFileSync(join(root,path),'utf8'),target=join(consumer,path),rewrites=[];
 const text=original.replace(/(['"])((?:\.\.\/)+)packages\/(breditor-[^/]+)\/([^'"]+)\1/g,(from,quote,_prefix,folder,tail)=>{const name=mapping.get(folder);assert.ok(name);let location=relative(dirname(target),join(consumer,'node_modules',name,tail));if(!location.startsWith('.'))location='./'+location;if(tail.endsWith('/')&&!location.endsWith('/'))location+='/';const to=quote+location+quote;rewrites.push([from,to]);return to;});
 let reversed=text;for(const[from,to]of rewrites.toReversed())reversed=reversed.replaceAll(to,from);assert.equal(reversed,original,'Only reversible module locations may change');assert.equal(text.includes('/Users/s/'),false);assert.equal(/(?:\.\.\/)+packages\/breditor-/.test(text),false);
 fs.mkdirSync(dirname(target),{recursive:true});fs.writeFileSync(target,text);copied.push({path,sourceSha256:sha(original),installedSha256:sha(text),reversibleModuleLocationsOnly:true});
 for(const hit of original.matchAll(/['"](\.[^'"]+\.mjs)['"]/g)){const dependency=resolve(dirname(join(root,path)),hit[1]);if(dependency.startsWith(root+'/scripts/')&&fs.existsSync(dependency))copyScript(relative(root,dependency));}
}
const tests=['storage-terminal-lifecycle.test.mjs','native-storage-lifecycle.test.mjs'];for(const test of tests)copyScript('scripts/'+test);
const fixture='crates/breditor-core/tests/fixtures/rich-local-root.json';fs.mkdirSync(dirname(join(consumer,fixture)),{recursive:true});fs.copyFileSync(join(root,fixture),join(consumer,fixture));
const types='scripts/fixtures/editor-consumer/types-owned-core-cleanup.ts';fs.mkdirSync(dirname(join(consumer,types)),{recursive:true});fs.copyFileSync(join(root,types),join(consumer,types));
const compiler=join(root,'node_modules/typescript/bin/tsc'),compilerSha256=sha(fs.readFileSync(compiler));execFileSync(process.execPath,[compiler,'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM,ESNext.Disposable',types],{cwd:consumer,stdio:'inherit'});
const log=execFileSync(process.execPath,['--test',...tests.map(test=>'scripts/'+test)],{cwd:consumer,encoding:'utf8',maxBuffer:4*1024*1024,timeout:180000});fs.writeFileSync(join(directory,'contracts.log'),log);for(const [key,n]of [['tests',7],['pass',7],['fail',0],['cancelled',0],['skipped',0],['todo',0]])assert.match(log,new RegExp('^# '+key+' '+n+'$','m'));
fs.writeFileSync(join(consumer,'entry.mjs'),'export {settleOwnedTransaction} from "./node_modules/@breditor/collaboration/dist/persistence/settle_owned_transaction.js";export {readOperationSourceDatabase} from "./node_modules/@breditor/collaboration/dist/independent_operation/read_source_database.js";');
const output=await build({configFile:false,root:consumer,logLevel:'error',build:{target:'es2022',write:false,minify:false,lib:{entry:join(consumer,'entry.mjs'),formats:['es'],fileName:'storage-lifecycle'}}}),modules=(Array.isArray(output)?output:[output]).flatMap(result=>result.output).filter(chunk=>chunk.type==='chunk').flatMap(chunk=>Object.keys(chunk.modules));
for(const module of ['persistence/settle_owned_transaction.js','independent_operation/read_source_database.js'])assert.ok(modules.some(path=>path.endsWith('/node_modules/@breditor/collaboration/dist/'+module)));assert.ok(!modules.some(path=>path.includes(join(root,'packages'))||path.includes('fake-indexeddb')||path.includes('/node_modules/react/')));
assert.deepEqual(sourceEvidence(root),source);assert.equal(sha(fs.readFileSync(compiler)),compilerSha256);
const report={format:'breditor/storage-terminal-lifecycle-installed-consumer',passed:true,source,sourceUnchanged:true,directory,consumer,workspaceLinks:false,strictPublicTypes:true,compilerSha256,registryArtifacts,copied,tests:7,failed:0,skipped:0,log:join(directory,'contracts.log'),logSha256:sha(log),archives:packs.map(pack=>({name:pack.name,path:join(archives,pack.filename),sha256:sha(fs.readFileSync(join(archives,pack.filename)))})),productionModules:modules.length,noSyntheticStorageInProduction:true,fullColdQualified:false,releaseReady:false,scope:'Owned terminal callback release, exact genuine native source cuts and future document/review Undo/Redo, live version-change watches, unchanged persistent bytes and committed metadata facts before late authority refusal. Controlled Node IDB; no full-room cold recovery, platform durability or V1 completion claim.'};
saveEvidence(join(directory,'result.json'),report);saveEvidence(join(root,'target/storage-terminal-lifecycle-installed-consumer.json'),report);console.log(JSON.stringify({directory,passed:true,tests:7,workspaceLinks:false,sourceUnchanged:true}));
