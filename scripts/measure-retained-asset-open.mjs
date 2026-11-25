/** Opt-in Chrome measurements using independently installed asset archives. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build,preview} from 'vite';
import {chromium} from 'playwright';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const args=process.argv.slice(2),modes=new Map([
 ['--reconciliation-writes',{entry:'reconciliation.html',method:'measureReconciledAssetWrites',format:'installed-asset-reconciliation-writes',files:['reconciliation.mjs','raster-write-count.mjs']}],
 ['--upload-queue-writes',{entry:'upload-queue.html',method:'measureUploadQueueWrites',format:'installed-asset-upload-queue-writes',files:['upload-queue.mjs','raster-write-count.mjs']}],
]);
const mode=modes.get(args[0]);
if(mode)args.shift();
const {entry,method,format,files}=mode??{entry:'index.html',method:'measureRetainedAssetOpen',format:'installed-retained-asset-open',files:[]};
assert.ok(args.length<=1);
const report=JSON.parse(readFileSync(resolve(args[0]??join(root,'target/asset-backups-installed-consumer.json'))));
assert.equal(report.passed,true);
assert.equal(report.workspaceLinks,false);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const archive of report.archives)assert.equal(sha(readFileSync(archive.path)),archive.sha256);
const source=sourceEvidence(root);
const temporary=mkdtempSync(join(tmpdir(),'breditor-retained-asset-open-')),consumer=join(temporary,'consumer');
let browser,server;
try{
 mkdirSync(consumer);
 const producer=JSON.parse(readFileSync(join(root,'package-lock.json')));
 const locked=searchConsumerLock(producer,report.archives);
 writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));
 writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));
 execFileSync('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
 const registryArtifactsPinnedToProducer=verifySearchConsumerRegistry(producer,JSON.parse(readFileSync(join(consumer,'package-lock.json'))));
 const fixtureProof=[];
 for(const file of [entry,'measure.mjs',...files]){
  const path=join('scripts/fixtures/retained-asset-open-measurement',file);
  cpSync(join(root,path),join(consumer,file));
  const sha256=sha(readFileSync(join(consumer,file)));
  assert.equal(sha256,sha(readFileSync(join(root,path))));
  fixtureProof.push({path,sha256});
 }
 await build({configFile:false,root:consumer,logLevel:'error',build:{outDir:'dist',modulePreload:{polyfill:false},rolldownOptions:{input:join(consumer,entry)}}});
 server=await preview({configFile:false,root:consumer,logLevel:'error',build:{outDir:'dist'},preview:{host:'127.0.0.1',port:0,strictPort:true}});
 browser=await chromium.launch({channel:'chrome'});
 const page=await browser.newPage(),errors=[],wasm=[];
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('response',response=>{if(new URL(response.url()).pathname.endsWith('.wasm'))wasm.push(response.body().then(sha));});
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/${entry}`);
 await page.waitForFunction(name=>typeof window[name]==='function',method);
 const measurements=await page.evaluate(name=>window[name](),method);
 assert.equal(measurements.passed,true);
 assert.deepEqual(errors,[]);
 assert.deepEqual([...new Set(await Promise.all(wasm))],[report.localWasmSha256]);
 assert.deepEqual(sourceEvidence(root),source);
 const result={format:'breditor/'+format,source,producer:report.source,browser:browser.version(),
  localWasmSha256:report.localWasmSha256,fixtureProof,registryArtifactsPinnedToProducer,
  archives:report.archives.map(({name,sha256})=>({name,sha256})),...measurements};
 mkdirSync(join(root,'target'),{recursive:true});
 saveEvidence(join(root,'target',format+'.json'),result);
 console.log(JSON.stringify(result,null,2));
}finally{
 await browser?.close();
 if(server)await new Promise(resolve=>server.httpServer.close(resolve));
 rmSync(temporary,{recursive:true,force:true});
}
