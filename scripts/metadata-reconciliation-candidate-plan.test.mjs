/** Required real Native workflow, strict consumer types and fresh evidence in both profiles. */
import test from 'node:test';import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {candidateShardPlan} from './candidate-release/shards.mjs';
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sourceEvidence} from './candidate-release/evidence.mjs';
import {metadataReconciliationHosts,metadataReconciliationHostReceipt,retainMetadataReconciliationHosts,verifyMetadataReconciliationHosts} from './candidate-release/metadata-reconciliation-hosts.mjs';
import {nativeSuggestionTarget} from './candidate-release/native-suggestion-build-evidence.mjs';
import {metadataRecoveryArtifacts} from './metadata-recovery-artifacts.mjs';
for(const profile of ['functional','full'])test(profile+': release requires genuine room/metadata/provider reconciliation and original ownership regressions',()=>{
 const plan=candidateReleasePlan({profile}),rows=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}]));
 const ids=['metadata-reconciliation-plan-contracts','metadata-reconciliation-private-types','metadata-reconciliation-component-contracts','metadata-reconciliation-native','installed-metadata-reconciliation'];
 for(const id of ids){const row=rows.get(id);assert.ok(row,id);assert.notEqual(row.required,false);for(const dependency of ['collaboration-build','rich-browser-build','native-suggestion-room-host','selected-delivery-native-host','segmented-relay-native-host','metadata-reconciliation-root-host'])assert.ok(rows.get(dependency).index<row.index);}
 const native=rows.get('metadata-reconciliation-native');for(const file of ['metadata-reconciliation-input-native.test.mjs','original-retention-version-loan-native.test.mjs','original-recovery-owner-version-loan-native.test.mjs','original-retained-root-version-loan-native.test.mjs','metadata-provider-reconciliation-native.test.mjs','metadata-provider-reconciliation-cold-native.test.mjs'])assert.ok(native.args.includes('scripts/'+file));
 const producer=rows.get('metadata-reconciliation-root-host');assert.ok(producer.args.includes('generation_complete_control_functional'));assert.ok(producer.artifacts.some(row=>row.path.endsWith('/generation_complete_control_functional')));
 const companion=rows.get('metadata-reconciliation-companion-hosts');
 assert.ok(companion.index<native.index);
 assert.deepEqual(companion.artifacts,[{path:metadataReconciliationHostReceipt,fresh:true,retain:true}]);
 assert.ok(native.timeoutMs>=7200000);assert.ok(native.index<rows.get('installed-metadata-reconciliation').index);
 const types=rows.get('metadata-reconciliation-private-types');for(const flag of ['--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess'])assert.ok(types.args.includes(flag));
 assert.ok(types.args.includes('scripts/fixtures/editor-consumer/types-local-metadata-reconciliation.ts'));
 assert.deepEqual(rows.get('installed-metadata-reconciliation').artifacts,[{path:metadataRecoveryArtifacts.reconciliation,fresh:true,retain:true}]);assert.ok(rows.get('installed-metadata-reconciliation').timeoutMs>=7200000);
 if(profile==='full')for(const [mode,id] of [['source',native.id],['installed','installed-metadata-reconciliation']]){
  const shard=candidateShardPlan(plan,'metadata-reconciliation-'+mode);
  assert.equal(shard.shard.stages.at(-1),id);
  for(const dependency of ['native-suggestion-room-host',companion.id])assert.ok(shard.checks.findIndex(check=>check.id===dependency)>=0);
  assert.ok(shard.checks.reduce((total,check)=>total+check.timeoutMs,0)<6*3600000);
 }
 assert.ok(rows.get('segmented-retained-storage-contracts').index<rows.get('installed-metadata-reconciliation').index);
 assert.ok(rows.has('installed-metadata-server-bytes'));assert.ok(rows.has('installed-recoverable-metadata'));assert.equal(plan.v1Ready,false);
});

test('installed reconciliation keeps every original case and requires the complete post-ACK cold workflow',()=>{const script=readFileSync(new URL('./check-metadata-reconciliation-installed.mjs',import.meta.url),'utf8');for(const text of ["'metadata-provider-reconciliation-native.test.mjs'","'metadata-provider-reconciliation-cold-native.test.mjs'","['tests',114],['pass',114]",'workspaceLinks:false','sourceUnchanged:true'])assert.ok(script.includes(text),text);});

test('the companion host receipt rejects stale source or changed executable bytes',()=>{
 const root=mkdtempSync(join(realpathSync(tmpdir()),'breditor-metadata-host-receipt-'));
 try{
  execFileSync('git',['init','--quiet'],{cwd:root});
  writeFileSync(join(root,'.gitignore'),'target/\n');
  const source=sourceEvidence(root),directory=join(root,nativeSuggestionTarget,'release','examples');
  mkdirSync(directory,{recursive:true});
  const files=metadataReconciliationHosts.map(name=>join(directory,name+(process.platform==='win32'?'.exe':'')));
  for(const [index,file] of files.entries())writeFileSync(file,'example '+index);
  const receipt=retainMetadataReconciliationHosts(root,source,files);
  assert.deepEqual(verifyMetadataReconciliationHosts(root,source).binaries,receipt.binaries);
  assert.throws(()=>verifyMetadataReconciliationHosts(root,{...source,commit:'other candidate'}),/another candidate/);
  writeFileSync(files[0],'changed bytes');
  assert.throws(()=>verifyMetadataReconciliationHosts(root,source),/differ/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
