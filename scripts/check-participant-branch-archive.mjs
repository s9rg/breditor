/** Run the same exact fork recovery tests against workspace and offline-installed SDKs. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {installCollaborationConsumer} from './fixtures/installed-collaboration-consumer.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const runtime='runtime/breditor_shared_bg.wasm';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=sourceEvidence(root);
assert.equal(source.dirty,false);
const runtimeSha256=sha(readFileSync(join(root,'packages/breditor-collaboration/dist',runtime)));
const sandbox=mkdtempSync(join(tmpdir(),'breditor-branch-consumer-'));
try{
 const reports={};
 for(const mode of ['source','installed']){
  const env={...process.env,BREDITOR_BRANCH_TEST_WASM_SHA256:runtimeSha256};
  delete env.BREDITOR_BRANCH_TEST_PACKAGES;
  let proof=null;
  if(mode==='installed'){
   const installed=installCollaborationConsumer(root,sandbox);
   assert.equal(sha(readFileSync(join(installed.distribution,runtime))),runtimeSha256);
   env.BREDITOR_BRANCH_TEST_PACKAGES=join(sandbox,'consumer/node_modules/@breditor');
   proof=installed.proof;
  }
  const output=execFileSync(process.execPath,['--test','scripts/participant-branch-archive.test.mjs'],{
   cwd:root,env,encoding:'utf8',timeout:120_000,
  });
  const passed=Number(output.match(/^# pass (\d+)$/m)?.[1]),failed=Number(output.match(/^# fail (\d+)$/m)?.[1]);
  assert.ok(passed>=6);
  assert.equal(failed,0);
  reports[mode]={passed,failed,proof,testOutputSha256:sha(output)};
  process.stdout.write(output);
 }
 assert.deepEqual(sourceEvidence(root),source);
 const report={format:'breditor/participant-branch-archive-qualification',formatVersion:1,source,runtimeSha256,reports};
 saveEvidence(join(root,'target/qualified-participant-branch-archive.json'),report);
 console.log(JSON.stringify(report,null,2));
}finally{
 rmSync(sandbox,{recursive:true,force:true});
}
