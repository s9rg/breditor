/** Opt-in Chrome measurement with exact installed packages and a disposable origin. */
import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build,preview} from 'vite';
import {chromium} from 'playwright';
import {installCollaborationConsumer} from './fixtures/installed-collaboration-consumer.mjs';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';

assert.equal(process.argv.length,2);
const root=fileURLToPath(new URL('..',import.meta.url));
const source=sourceEvidence(root);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const scratch=mkdtempSync(join(tmpdir(),'breditor-paired-save-measurement-'));
let browser,server;
try{
 const {distribution,proof}=installCollaborationConsumer(root,scratch);
 const consumer=join(scratch,'consumer');
 const fixtures=new Map([
  ['index.html','scripts/fixtures/paired-save-measurement/index.html'],
  ['measure.mjs','scripts/fixtures/paired-save-measurement/measure.mjs'],
  ['fullscreen-seed.mjs','scripts/fixtures/editor-consumer/fullscreen-seed.mjs'],
  ['coverage-seed.mjs','scripts/fixtures/editor-consumer/coverage-seed.mjs'],
 ]);
 const fixtureProof=[];
 for(const [name,path] of fixtures){
  cpSync(join(root,path),join(consumer,name));
  const sha256=sha(readFileSync(join(consumer,name)));
  assert.equal(sha256,sha(readFileSync(join(root,path))));
  fixtureProof.push({path,sha256});
 }
 await build({configFile:false,root:consumer,logLevel:'error',build:{outDir:'dist',target:'es2022',modulePreload:{polyfill:false}}});
 server=await preview({configFile:false,root:consumer,logLevel:'error',build:{outDir:'dist'},preview:{host:'127.0.0.1',port:0,strictPort:true}});
 browser=await chromium.launch({channel:'chrome'});
 const page=await browser.newPage(),errors=[],wasm=[];
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('response',response=>{if(new URL(response.url()).pathname.endsWith('.wasm'))wasm.push(response.body().then(sha));});
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
 await page.waitForFunction(()=>!!window.runPairedSave);
 const measurements=await page.evaluate(()=>window.runPairedSave());
 assert.deepEqual(errors,[]);
 const runtimeSha256=sha(readFileSync(join(distribution,'runtime/breditor_shared_bg.wasm')));
 assert.deepEqual([...new Set(await Promise.all(wasm))],[runtimeSha256]);
 assert.equal(measurements.passed,true);
 assert.equal(measurements.samples.length,16);
 assert.deepEqual(sourceEvidence(root),source);
 const evidence={format:'breditor/installed-paired-save-measurement',source,browser:browser.version(),runtimeSha256,fixtureProof,...proof,...measurements};
 const receipt=join(root,'target/installed-paired-save-measurement.json');
 mkdirSync(dirname(receipt),{recursive:true});
 saveEvidence(receipt,evidence);
 console.log(JSON.stringify(evidence,null,2));
}finally{
 await browser?.close();
 if(server)await new Promise(resolve=>server.httpServer.close(resolve));
 rmSync(scratch,{recursive:true,force:true});
}
