/** Exercise the real writer and release collector in the same isolated root.
 * No Native qualification is rerun merely to test a result filename. */
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {fileEvidence} from './candidate-release/evidence.mjs';
import {metadataRecoveryArtifacts,saveMetadataRecoveryEvidence} from './metadata-recovery-artifacts.mjs';
for(const profile of ['functional','full'])for(const [kind,id]of [['recoverable','installed-recoverable-metadata'],['serverBytes','installed-metadata-server-bytes'],['reconciliation','installed-metadata-reconciliation']])test(profile+': installed '+kind+' result is the exact fresh release artifact',()=>{
 const root=mkdtempSync('/private/tmp/breditor-recovery-artifact-contract-');mkdirSync(join(root,'target'));
 try{const plan=candidateReleasePlan({profile}),row=plan.checks.find(row=>row.id===id),artifact=row.artifacts[0],value={complete:true,sourceUnchanged:true,producer:kind};
  assert.deepEqual(artifact,{path:metadataRecoveryArtifacts[kind],fresh:true});
  assert.equal(saveMetadataRecoveryEvidence(root,kind,value),join(root,artifact.path));
  assert.deepEqual(JSON.parse(readFileSync(join(root,artifact.path),'utf8')),value);
  const observed=fileEvidence(root,artifact.path);assert.equal(observed.path,artifact.path);assert.ok(observed.bytes>0);
  assert.ok(plan.checks.find(check=>check.id==='metadata-recovery-artifact-contracts'));
  assert.equal(plan.v1Ready,false);
 }finally{rmSync(root,{recursive:true});}
});
test('unknown producer refuses without creating a result or temporary file',()=>{
 const root=mkdtempSync('/private/tmp/breditor-recovery-artifact-contract-');mkdirSync(join(root,'target'));
 try{for(const kind of ['unknown','__proto__'])assert.throws(()=>saveMetadataRecoveryEvidence(root,kind,{}));assert.deepEqual(readdirSync(join(root,'target')),[]);}finally{rmSync(root,{recursive:true});}
});
