/** Qualify the public SDK against a real sealed handover, from source and an offline install. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {closeSync,mkdirSync,mkdtempSync,openSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';

if(process.argv.length!==2)throw Error('Run the complete source and installed handover check');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const source=sourceEvidence(root);
const directory=mkdtempSync(join(root,'target/handover-path-sdk-'));
const archives=join(directory,'archives'),consumer=join(directory,'consumer');
const packages=['@breditor/browser','@breditor/experimental-rich-content','@breditor/collaboration'];
const fixture=join(root,'scripts/fixtures/handover-path/actual.mjs');
const npm=process.env.BREDITOR_NPM??'npm';
const cargo=process.env.BREDITOR_CARGO??join(homedir(),'.cargo/bin/cargo');
const target=join(root,'target/owned-history-relay-native');
mkdirSync(archives);
mkdirSync(consumer);

const generated=JSON.parse(execFileSync(process.execPath,['scripts/check-generated-package-output.mjs'],{cwd:root,encoding:'utf8'}));
assert.equal(generated.passed,true);
const packed=JSON.parse(execFileSync(npm,[
 'pack','--offline','--ignore-scripts','--json','--pack-destination',archives,
 ...packages.flatMap(name=>['--workspace',name]),
],{cwd:root,encoding:'utf8'}));
const producer=JSON.parse(readFileSync(join(root,'package-lock.json')));
const locked=searchConsumerLock(producer,packed.map(row=>({name:row.name,path:join(archives,row.filename)})));
writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));
writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));
execFileSync(npm,['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
const registry=verifySearchConsumerRegistry(producer,JSON.parse(readFileSync(join(consumer,'package-lock.json'))));
for(const name of packages)assert.ok(realpathSync(join(consumer,'node_modules',name)).startsWith(realpathSync(consumer)+'/node_modules/'));
const original=readFileSync(fixture,'utf8'),installed=join(consumer,'actual.mjs');
const from='../../../packages/breditor-collaboration/dist/index.js',to='@breditor/collaboration';
const relocated=original.replace(from,to);
assert.notEqual(relocated,original);
assert.equal(relocated.replace(to,from),original);
writeFileSync(installed,relocated,{flag:'wx'});

const results=[];
for(const [name,script] of [['source',fixture],['installed',installed]]){
 const log=join(directory,name+'.log');
 const fd=openSync(log,'wx');
 let result;
 try{
  result=spawnSync(cargo,[
   'test','--manifest-path','experiments/relay/Cargo.toml','--features','server','--release','--locked','--offline','--lib',
   'http_activated_host_seals_the_next_cut_and_fresh_control_resumes_offline_history','--','--nocapture',
  ],{cwd:root,stdio:['ignore',fd,fd],env:{...process.env,CARGO_TARGET_DIR:target,BREDITOR_HANDOVER_SDK_CHECK:script}});
 }finally{closeSync(fd);}
 assert.equal(result.error,undefined);
 assert.equal(result.status,0,'Read '+log);
 const output=readFileSync(log,'utf8');
 assert.match(output,/^HANDOVER_SDK_ACTUAL_CONTROL_OK$/m);
 assert.match(output,/^test result: ok\. 1 passed; 0 failed; 0 ignored;/m);
 results.push({name,log});
}
assert.deepEqual(sourceEvidence(root),source);
const report={source,passed:true,directory,consumer,generated,registry,results};
saveEvidence(join(directory,'result.json'),report);
saveEvidence(join(root,'target/handover-path-sdk.json'),report);
console.log(JSON.stringify({directory,passed:true,source:source.commit}));
