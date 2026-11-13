import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {copyConsumerFixtures} from './candidate-release/copy-consumer-fixtures.mjs';
import {saveEvidence,sourceEvidence} from './candidate-release/evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root);
assert.equal(source.dirty,false,'Qualify a clean source checkpoint');
const [mode,...args]=process.argv.slice(2);
assert.ok(['source','installed'].includes(mode)&&args.length===2,'Supply source or installed and both native relay fixtures');
const hosts=args.map(path=>realpathSync(resolve(path)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fileDigest=path=>sha(readFileSync(path));
const nativeHosts=hosts.map(path=>({path,sha256:fileDigest(path)}));
const name='probe-continued-delivery.mjs',sourceProbe=join(root,'scripts',name);
let runtime=join(root,'target/promoted-shared-web'),probe=sourceProbe,cwd=root,consumerProof=null;
const sharedWasmSha256=fileDigest(join(runtime,'breditor_shared_bg.wasm'));
if(mode==='installed'){
 const temporary=mkdtempSync(join(tmpdir(),'breditor-continued-delivery-installed-'));
 const archives=join(temporary,'archives'),consumer=join(temporary,'consumer'),npm=process.env.BREDITOR_NPM??process.env.NPM_BIN??'npm';
 mkdirSync(archives);mkdirSync(consumer);
 const packages=['@breditor/browser','@breditor/experimental-rich-content','@breditor/collaboration'];
 const packs=JSON.parse(execFileSync(npm,['pack','--offline','--ignore-scripts','--json','--pack-destination',archives,
  ...packages.flatMap(name=>['--workspace',name])],{cwd:root,encoding:'utf8'}));
 const entries=packs.map(({name,filename})=>({name,path:join(archives,filename)}));
 const producer=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8')),locked=searchConsumerLock(producer,entries);
 writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));
 writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));
 execFileSync(npm,['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
 const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(readFileSync(join(consumer,'package-lock.json'),'utf8')));
 for(const name of packages)assert.ok(realpathSync(join(consumer,'node_modules',name)).startsWith(realpathSync(consumer)+'/node_modules/'));
 copyConsumerFixtures(root,consumer,['relay-host.mjs','relay-wire.mjs','room-participant-inventory/environment.mjs','independent-delivery/session.mjs','review-assets/pixels.mjs']);
 cpSync(join(root,'crates/breditor-core/tests/fixtures/rich-local-root.json'),join(consumer,'rich-local-root.json'));
 const types='types-continued-pair.ts';
 cpSync(join(root,'scripts/fixtures/editor-consumer',types),join(consumer,types));
 execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes',
  '--target','ES2022','--module','NodeNext','--lib','ES2022,DOM,ESNext.Disposable',types],{cwd:consumer,stdio:'inherit'});
 const original=readFileSync(sourceProbe,'utf8'),rewrites=[
  ["'../packages/breditor-collaboration/dist/index.js'","'@breditor/collaboration'"],
  ["'../crates/breditor-core/tests/fixtures/rich-local-root.json'","'./rich-local-root.json'"],
 ];
 const installed=rewrites.reduce((text,[from,to])=>text.replace(from,to),original);
 assert.ok(!installed.includes('../packages/')&&!installed.includes('../crates/'));
 assert.equal(rewrites.reduceRight((text,[from,to])=>text.replace(to,from),installed),original);
 cwd=consumer;probe=join(consumer,name);writeFileSync(probe,installed);
 runtime=join(consumer,'node_modules/@breditor/collaboration/dist/runtime');
 assert.equal(fileDigest(join(runtime,'breditor_shared_bg.wasm')),sharedWasmSha256);
 consumerProof={consumer,workspaceLinks:false,strictPublicTypes:true,registryArtifacts,
  archives:entries.map(entry=>({...entry,sha256:fileDigest(entry.path)}))};
}
const result=JSON.parse(execFileSync(process.execPath,[probe,runtime,...hosts],{cwd,encoding:'utf8',timeout:120000}));
assert.deepEqual(result,{passed:true,nativeRooms:3,coldReads:3,packetsRetained:6,lostAcknowledgements:2,
 reviewReceipts:3,documentReceipts:3,undoRedo:3,ceilingChecks:3,duplicateRefusals:3,recoveryImports:3,deliveredPackets:5,verifiedRecordReads:3,unacknowledgedRecordReads:2,archiveRoundTrips:3,archiveMissingAssets:3,packetAssets:1,archivedUnacknowledgedSaves:2,uploadRestores:3,sharedWasmSha256});
assert.deepEqual(sourceEvidence(root),source);
assert.deepEqual(hosts.map(fileDigest),nativeHosts.map(row=>row.sha256));
const report={format:'breditor/continued-delivery-qualification',formatVersion:1,passed:true,source,mode,nativeHosts,result,consumerProof};
saveEvidence(join(root,'target',`qualified-continued-delivery-${mode}.json`),report);
console.log(JSON.stringify(report,null,2));
