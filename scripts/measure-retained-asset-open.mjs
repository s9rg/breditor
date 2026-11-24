/** Opt-in Chrome measurement using independently installed asset archives. */
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
assert.ok(process.argv.length<=3);
const report=JSON.parse(readFileSync(resolve(process.argv[2]??join(root,'target/asset-backups-installed-consumer.json'))));
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
 for(const file of ['index.html','measure.mjs']){
  const path=join('scripts/fixtures/retained-asset-open-measurement',file);
  cpSync(join(root,path),join(consumer,file));
  const sha256=sha(readFileSync(join(consumer,file)));
  assert.equal(sha256,sha(readFileSync(join(root,path))));
  fixtureProof.push({path,sha256});
 }
 await build({configFile:false,root:consumer,logLevel:'error',build:{outDir:'dist',modulePreload:{polyfill:false}}});
 server=await preview({configFile:false,root:consumer,logLevel:'error',build:{outDir:'dist'},preview:{host:'127.0.0.1',port:0,strictPort:true}});
 browser=await chromium.launch({channel:'chrome'});
 const page=await browser.newPage(),errors=[],wasm=[];
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('response',response=>{if(new URL(response.url()).pathname.endsWith('.wasm'))wasm.push(response.body().then(sha));});
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
 await page.waitForFunction(()=>!!window.measureRetainedAssetOpen);
 const measurements=await page.evaluate(()=>window.measureRetainedAssetOpen());
 assert.equal(measurements.passed,true);
 assert.deepEqual(errors,[]);
 assert.deepEqual([...new Set(await Promise.all(wasm))],[report.localWasmSha256]);
 assert.deepEqual(sourceEvidence(root),source);
 const result={format:'breditor/installed-retained-asset-open',source,producer:report.source,browser:browser.version(),
  localWasmSha256:report.localWasmSha256,fixtureProof,registryArtifactsPinnedToProducer,
  archives:report.archives.map(({name,sha256})=>({name,sha256})),...measurements};
 mkdirSync(join(root,'target'),{recursive:true});
 saveEvidence(join(root,'target/installed-retained-asset-open.json'),result);
 console.log(JSON.stringify(result,null,2));
}finally{
 await browser?.close();
 if(server)await new Promise(resolve=>server.httpServer.close(resolve));
 rmSync(temporary,{recursive:true,force:true});
}
