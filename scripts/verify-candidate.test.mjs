import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync,spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,symlinkSync,utimesSync,statSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {candidateCheckProfiles,candidateReleasePlan,repository} from "./candidate-release/plan.mjs";
import {candidateShardIds,candidateShardPlan} from "./candidate-release/shards.mjs";
import {metadataFixtureStageIds} from "./candidate-release/metadata-fixture-evidence.mjs";
import {fileEvidence,sourceEvidence,saveEvidence} from "./candidate-release/evidence.mjs";
import {executeCandidateStage} from "./candidate-release/process.mjs";
import {runCandidateChecks} from "./verify-candidate.mjs";
import {candidateCoverage} from "./check-candidate-coverage.mjs";
import {verifyHostedContext} from "./candidate-release/hosted-context.mjs";
import {validateApplicationNetworkReport} from "./candidate-release/application-network-report.mjs";
const temporary=()=>mkdtempSync(join(tmpdir(),"breditor-candidate-contract-"));
const fixtureCheck=(id="fixture",script="console.log('fixture proof')")=>({id,command:process.execPath,args:["-e",script],env:{},artifacts:[],timeoutMs:4000});
const plan=checks=>({profile:"functional",deferred:["not-a-v1-certification"],checks});
const stable=()=>({commit:"1".repeat(40),dirty:true,sha256:"2".repeat(64),files:1,bytes:1});
function quiet(options={}){return {snapshot:stable,report:()=>{},...options};}

test("candidate coverage requires one clean source, complete selected stages and retained bytes",async()=>{
 const root=temporary(),git=args=>execFileSync("git",args,{cwd:root,stdio:"ignore"});
 try{
  git(["init","-q"]);
  writeFileSync(join(root,".gitignore"),"target/\ndist/\n");
  git(["add",".gitignore"]);
  git(["-c","user.name=Candidate Fixture","-c","user.email=fixture@example.test","commit","-qm","Candidate source"]);
  const selected=candidateReleasePlan({profile:"dependency-inventories"});
  const run=await runCandidateChecks(selected,{root,report:()=>{},execute:async(check,{logPath})=>{
   writeFileSync(logPath,check.id);
   for(const artifact of check.artifacts){
    const output=join(root,artifact.path);
    mkdirSync(dirname(output),{recursive:true});
    writeFileSync(output,artifact.path);
    // Permit coarse filesystem timestamp granularity in this synthetic fixture.
    const now=Date.now()/1000;
    utimesSync(output,now+2,now+2);
   }
   return {status:"passed"};
  }});
  assert.equal(run.exitCode,0,run.result.error);
  const report=candidateCoverage(root,[run.manifest,run.manifest]);
  assert.equal(report.coveredStages,selected.checks.length);
  assert.equal(report.complete,false);
  assert.ok(report.missing.includes("default-package-release-matrix"));
  assert.ok(!report.missing.includes("reviewed-v1-readiness"));

  const manifest=JSON.parse(readFileSync(run.manifest));
  const original=structuredClone(manifest);
  assert.throws(()=>candidateCoverage(root,[run.manifest],{requireHosted:true}),/runner-context.tsv/);

  manifest.environment={...manifest.environment,platform:"linux",arch:"x64"};
  saveEvidence(run.manifest,manifest);
  const contextPath=join(dirname(dirname(run.manifest)),"runner-context.tsv");
  const runner={
   format:"1",repository:"s9rg/breditor",workflow:"s9rg/breditor/.github/workflows/candidate-qualification.yml@refs/heads/main",
   event:"workflow_dispatch",runId:"123",runAttempt:"2",revision:manifest.source.commit,
   profile:manifest.profile,shard:"none",os:"Linux",arch:"X64",checkout:"success",node:"success",
   rust:"success",npm:"success",cargo:"success",browsers:"skipped",candidate:"success",
  };
  const context=value=>Object.entries(value).map(([key,value])=>key+"\t"+value).join("\n")+"\n";
  writeFileSync(contextPath,context(runner));
  const hosted=candidateCoverage(root,[run.manifest],{requireHosted:true}).evidence[0].hosted;
  assert.deepEqual(hosted,{repository:runner.repository,workflow:runner.workflow,runId:runner.runId,
   runAttempt:runner.runAttempt,contextSha256:fileEvidence(dirname(contextPath),"runner-context.tsv").sha256});
  for(const [patch,message] of [
   [{revision:"0".repeat(40)},/revision differs/],
   [{profile:"full"},/profile differs/],
   [{shard:"native"},/shard differs/],
   [{candidate:"failure"},/candidate did not succeed/],
   [{browsers:"success"},/browser setup differs/],
   [{workflow:runner.workflow.replace("candidate-qualification.yml","unrelated.yml")},/different workflow/],
  ]){
   writeFileSync(contextPath,context({...runner,...patch}));
   assert.throws(()=>candidateCoverage(root,[run.manifest],{requireHosted:true}),message);
  }
  writeFileSync(contextPath,context(runner)+"runAttempt\t3\n");
  assert.throws(()=>candidateCoverage(root,[run.manifest],{requireHosted:true}),/duplicate hosted runner context fields/);

  const browserPlan=candidateReleasePlan({profile:"default-matrix"});
  const browserReceipt={...manifest,profile:browserPlan.profile};
  writeFileSync(contextPath,context({...runner,profile:browserPlan.profile}));
  assert.throws(()=>verifyHostedContext(dirname(run.manifest),browserReceipt,browserPlan),/browser setup differs/);
  writeFileSync(contextPath,context({...runner,profile:browserPlan.profile,browsers:"success"}));
  assert.equal(verifyHostedContext(dirname(run.manifest),browserReceipt,browserPlan).runId,runner.runId);
  manifest.environment=original.environment;
  manifest.source.commit="0".repeat(40);
  saveEvidence(run.manifest,manifest);
  assert.throws(()=>candidateCoverage(root,[run.manifest]),/Source mismatch/);
  manifest.source=original.source;
  manifest.stages.pop();
  saveEvidence(run.manifest,manifest);
  assert.throws(()=>candidateCoverage(root,[run.manifest]),/Stage sequence differs/);
  saveEvidence(run.manifest,original);
  const retained=original.stages[0].artifacts.find(artifact=>artifact.retainedPath);
  assert.ok(retained);
  const retainedPath=join(dirname(run.manifest),retained.retainedPath);
  writeFileSync(retainedPath,"x".repeat(retained.bytes));
  assert.throws(()=>candidateCoverage(root,[run.manifest]),/Retained file digest changed/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('both profiles require bounded native archive integrity and immutable physical catalog source/installed admission',()=>{
 for(const profile of ['functional','full']){const p=candidateReleasePlan({profile}),find=id=>{const row=p.checks.find(c=>c.id===id);assert.ok(row,id);return row;};for(const[id,file]of [['archive-integrity-contracts','archive-integrity.test.mjs'],['physical-room-catalog-contracts','physical-room-catalog-storage.test.mjs']])assert.deepEqual(find(id).args,['--test','scripts/'+file]);assert.ok(find('physical-room-catalog-type-fence').args.includes('scripts/fixtures/editor-consumer/types-physical-room-catalog.ts'));for(const[id,file,path]of [['physical-room-catalog','check-physical-room-catalog-sdk.mjs','target/physical-room-catalog-sdk.json'],['installed-physical-room-catalog','check-physical-room-catalog-installed.mjs','target/physical-room-catalog-installed.json']]){const row=find(id);assert.deepEqual(row.args,['scripts/'+file]);assert.deepEqual(row.artifacts,[{path,fresh:true}]);assert.ok(p.checks.indexOf(find('native-server-generation-inventory'))<p.checks.indexOf(row));assert.ok(p.checks.indexOf(find('collaboration-build'))<p.checks.indexOf(row));}assert.ok(p.checks.indexOf(find('paired-shared-runtime'))<p.checks.indexOf(find('archive-integrity-contracts')));}
 const installed=readFileSync(join(repository,'scripts/check-physical-room-catalog-installed.mjs'),'utf8');for(const text of ["'--offline'",'assert.deepEqual(native.source,source','fileEvidence(root,file.path)','verifySearchConsumerRegistry','types-physical-room-catalog.ts','probe-physical-room-catalog.mjs','archive-integrity.test.mjs','strictPublicTypes:true','workspaceLinks:false','assertionsUnchanged:true','sharedWasmSha256','assert.deepEqual(sourceEvidence(root),source)'])assert.ok(installed.includes(text),text);
});

test("both profiles run real portable relay relocation and legacy handover from the same fixture",()=>{
 const fixture="relay_segment_functional"+(process.platform==="win32"?".exe":"");
 const artifact="target/owned-history-relay-native/release/examples/"+fixture;
 for(const profile of ["functional","full"]){
  const {checks}=candidateReleasePlan({profile,environment:{BREDITOR_NPM:"npm-fixture"}});
  const locate=id=>{
   const index=checks.findIndex(check=>check.id===id);
   assert.notEqual(index,-1,id);
   return {check:checks[index],index};
  };
  const build=locate("functional-native-fixtures");
  assert.deepEqual(build.check.args.slice(-2),["--example","relay_segment_functional"]);
  assert.ok(build.check.artifacts.some(entry=>entry.path===artifact));
  for(const [id,option,report] of [
   ["portable-relay-relocation","--participant-portable-seal","qualified-portable-relocation.json"],
   ["portable-relay-legacy-handover","--participant-carried-alternate","qualified-carried-participant-alternate.json"],
  ]){
   const {check,index}=locate(id);
   assert.deepEqual(check.args,["scripts/check-writable-relay-segment.mjs",join(repository,artifact),option]);
   assert.deepEqual(check.artifacts,[{path:"target/"+report,fresh:true,retain:true}]);
   assert.equal(check.requiresSharedRuntime,true);
   assert.equal(check.env.BREDITOR_NPM,"npm-fixture");
   for(const prerequisite of ["paired-shared-runtime","collaboration-build","functional-native-fixtures"]){
    assert.ok(locate(prerequisite).index<index);
   }
  }
  assert.equal(locate("portable-relay-relocation").check.env.BREDITOR_EXPECT_DISCUSSION_TRANSCRIPT,"native");
 }
});

test('both profiles require complete physical server inventory pins and identical installed native-prefix probes',()=>{
 for(const profile of ['functional','full']){
  const p=candidateReleasePlan({profile}),find=id=>{const row=p.checks.find(c=>c.id===id);assert.ok(row,id);return row;};
  assert.deepEqual(find('server-generation-inventory-contracts').args,['--test','scripts/server-generation-inventory.test.mjs']);
  assert.ok(find('server-generation-inventory-type-fence').args.includes('scripts/fixtures/editor-consumer/types-server-generation-inventory.ts'));
  for(const[id,file,path]of [['native-server-generation-inventory','check-server-generation-inventory-native.mjs','target/server-generation-inventory-native.json'],['server-generation-inventory','check-server-generation-inventory-sdk.mjs','target/server-generation-inventory-sdk.json'],['installed-server-generation-inventory','check-server-generation-inventory-installed.mjs','target/server-generation-inventory-installed.json']]){const row=find(id);assert.deepEqual(row.args,[`scripts/${file}`]);assert.deepEqual(row.artifacts,[{path,fresh:true}]);assert.ok(p.checks.indexOf(find('collaboration-build'))<p.checks.indexOf(row));}
  for(const id of ['server-generation-inventory','installed-server-generation-inventory'])assert.ok(p.checks.indexOf(find('native-server-generation-inventory'))<p.checks.indexOf(find(id)));
 }
 const installed=readFileSync(join(repository,'scripts/check-server-generation-inventory-installed.mjs'),'utf8');for(const text of ["'--offline'",'assert.deepEqual(native.source,source','fileEvidence(root,file.path)','verifySearchConsumerRegistry','types-server-generation-inventory.ts','probe-server-generation-inventory.mjs','strictPublicTypes:true','workspaceLinks:false','sharedWasmSha256','assert.deepEqual(sourceEvidence(root),source)'])assert.ok(installed.includes(text),text);
});

test('read-only archival is explicitly native, type fenced and repeated in fresh public packages',()=>{
 for(const profile of ['functional','full']){
  const p=candidateReleasePlan({profile}),find=id=>{const row=p.checks.find(c=>c.id===id);assert.ok(row,id);return row;};
  for(const[id,file,path]of [['read-only-history','check-read-only-history-native.mjs','target/read-only-history-native.json'],['installed-read-only-history','check-read-only-history-installed.mjs','target/read-only-history-installed-consumer.json']]){const row=find(id);assert.deepEqual(row.args,[`scripts/${file}`]);assert.deepEqual(row.artifacts,[{path,fresh:true}]);assert.ok(p.checks.indexOf(find('collaboration-build'))<p.checks.indexOf(row));}
  assert.ok(find('read-only-history-type-fence').args.includes('scripts/fixtures/editor-consumer/types-read-only-history.ts'));
 }
 const installed=readFileSync(join(repository,'scripts/check-read-only-history-installed.mjs'),'utf8');for(const value of ['probe-read-only-history-native','probe-read-only-history-sdk','strictPublicTypes:true','probe.replaceAll(to,from).replace(local,fixture),original','saveAborts:2,lostAcknowledgements:2','sourceUnchanged:true'])assert.ok(installed.includes(value),value);
 const ownership=readFileSync(join(repository,'scripts/check-managed-core-binding-installed.mjs'),'utf8');assert.ok(ownership.includes('probe-relay-core-binding'));assert.ok(ownership.includes('getterCalls:0'));
 const relay=readFileSync(join(repository,'packages/breditor-collaboration/src/segmented_relay/session.ts'),'utf8');assert.ok(!relay.includes('this.core!==this.#core'));
});

test('persistent native custody is mandatory in source and unchanged fresh archive probes',()=>{
 for(const profile of ['functional','full']){
  const p=candidateReleasePlan({profile}),find=id=>{const row=p.checks.find(c=>c.id===id);assert.ok(row,id);return row;};
  for(const [id,file,path]of [['managed-core-binding','check-managed-core-binding.mjs','target/managed-core-binding-source.json'],['installed-managed-core-binding','check-managed-core-binding-installed.mjs','target/managed-core-binding-installed-consumer.json']]){
   assert.deepEqual(find(id).args,[`scripts/${file}`]);assert.deepEqual(find(id).artifacts,[{path,fresh:true}]);assert.ok(p.checks.indexOf(find('collaboration-build'))<p.checks.indexOf(find(id)));
  }
 }
 const installed=readFileSync(join(repository,'scripts/check-managed-core-binding-installed.mjs'),'utf8');
 for(const text of ['probe-managed-core-binding','probe-managed-original-core-binding','probe.replace(to,from),originalProbe','value.captureRefusals,1728','value.accessorCalls,0','verifySearchConsumerRegistry','sourceUnchanged:true'])assert.ok(installed.includes(text),text);
 for(const name of ['shared_session','review_session','segmented_session']){const source=readFileSync(join(repository,`packages/breditor-collaboration/src/persistence/${name}.ts`),'utf8');assert.ok(source.includes('readonly #ownedCore:'));assert.ok(source.includes('Object.getOwnPropertyDescriptor(this,"core")'));assert.ok(!source.includes('this.core.'));}
});

test('both profiles require native independent review generations and the unchanged installed assertions',()=>{
 for(const profile of ['functional','full']){
  const p=candidateReleasePlan({profile}),find=id=>{const row=p.checks.find(c=>c.id===id);assert.ok(row,id);return row;};
  for(const [id,file,path]of [['native-review-generations','check-review-generations-native.mjs','target/native-review-generations.json'],['installed-native-review-generations','check-review-generations-installed.mjs','target/native-review-generations-installed-consumer.json']]){
   assert.deepEqual(find(id).args,[`scripts/${file}`]);assert.deepEqual(find(id).artifacts,[{path,fresh:true}]);assert.ok(p.checks.indexOf(find('paired-shared-runtime'))<p.checks.indexOf(find(id)));
  }
  assert.ok(find('native-review-generations-type-fence').args.includes('scripts/fixtures/editor-consumer/types-review-generations.ts'));
  assert.deepEqual(find('research-review-generations').args,['test','--manifest-path','experiments/collaboration/Cargo.toml','--locked','--offline','--release','--test','review_generation_contracts']);
  assert.ok(p.checks.indexOf(find('shared-native'))<p.checks.indexOf(find('research-review-generations')));
  assert.ok(p.checks.indexOf(find('rich-browser-build'))<p.checks.indexOf(find('collaboration-build')));
  for(const id of ['native-review-generations','installed-native-review-generations']){
   assert.ok(p.checks.indexOf(find('collaboration-build'))<p.checks.indexOf(find(id)),id);
  }
 }
 const installed=readFileSync(join(repository,'scripts/check-review-generations-installed.mjs'),'utf8');
 for(const text of ['probe-segmented-review-native.mjs','types-review-generations.ts','installedProbe.replace(to,from),sourceProbe','sourceUnchanged:true','futureHistoryComparisons:216','observerColdReopens:6','networkCalls:0','verifySearchConsumerRegistry'])assert.ok(installed.includes(text),text);
 const source=readFileSync(join(repository,'scripts/check-review-generations-native.mjs'),'utf8');assert.ok(source.includes('assert.deepEqual(sourceEvidence(root),source'));
});

test("both profiles require the separate V2 catalog family, actual native staging and identical installed assertions",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const row=p.checks.find(c=>c.id===id);assert.ok(row,id);return row;};
  assert.deepEqual(find("room-recovery-catalog-v2-contracts").args,["--test","scripts/room-recovery-catalog-v2-storage.test.mjs"]);
  assert.deepEqual(find("recovery-cleanup-scope-contracts").args,["--test","scripts/recovery-cleanup-scope.test.mjs"]);
  assert.deepEqual(find("recovery-opening-custody-contracts").args,["--test","scripts/recovery-opening-custody.test.mjs"]);
  assert.ok(find("room-recovery-catalog-v2-type-fence").args.includes("scripts/fixtures/editor-consumer/types-room-recovery-catalog-v2.ts"));
  for(const[id,file,path]of [["room-recovery-catalog-v2","check-room-recovery-catalog-v2-sdk.mjs","target/room-recovery-catalog-v2-sdk.json"],["installed-room-recovery-catalog-v2","check-room-recovery-catalog-v2-installed.mjs","target/room-recovery-catalog-v2-installed-consumer.json"]]){const row=find(id);assert.deepEqual(row.args,[`scripts/${file}`]);assert.deepEqual(row.artifacts,[{path,fresh:true}]);assert.ok(p.checks.indexOf(find("native-room-participant-inventory"))<p.checks.indexOf(row));}
 }
 const installed=readFileSync(join(repository,"scripts/check-room-recovery-catalog-v2-installed.mjs"),"utf8");for(const text of ["buildRoomParticipantInventoryFixtures({saveReport:false})","sourceUnchanged:true","types-room-recovery-catalog-v2.ts","probe-room-recovery-catalog-v2.mjs","stagedGeneration:60","stagedMixed:60","coldGeneration:60","coldMixed:60","lostAcknowledgementResumes:6","mixedPolicySnapshots:2","cleanup-failures.mjs","failedCleanupRetries:6","originalCatalogCleanupRetries:2","acquisition-failures.mjs","failedAcquisitionRetries:12","acquisitionColdParticipants:12","participant_recovery/cleanup_scope.js","room_recovery_catalog_v2/coverage.js"])assert.ok(installed.includes(text),text);
 const sdk=readFileSync(join(repository,"scripts/check-room-recovery-catalog-v2-sdk.mjs"),"utf8");for(const text of ["assert.deepEqual(native.source,source","fileEvidence(root,file.path)","assert.deepEqual(sourceEvidence(root),source)"])assert.ok(sdk.includes(text),text);
 for(const text of ["opening-failures.mjs","initialOpeningRetries:20","openingLiveOwnerRefusals:8","openingReturnedOwnerReopens:8","participant_recovery/opening_custody.js"])assert.ok(installed.includes(text),text);
 for(const text of ["catalog-opening-failures.mjs","catalogOpeningRetries:8","catalogOpeningLiveOwnerRefusals:8","catalogOpeningRetainedRecordComparisons:4","catalogOpeningOriginalFileComparisons:32","catalogOpeningColdReopens:8"])assert.ok(installed.includes(text),text);
});

test("generation room inventory and internal custody remain native, source-bound and repeated in public archives",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const c=p.checks.find(c=>c.id===id);assert.ok(c,id);return c;};
  for(const [id,script,path]of [["generation-room-inventory","check-generation-room-inventory-sdk.mjs","target/generation-room-inventory-sdk.json"],["generation-room-custody","check-generation-room-custody-sdk.mjs","target/generation-room-custody-sdk.json"],["installed-generation-room","check-generation-room-installed.mjs","target/generation-room-installed-consumer.json"]]){const row=find(id);assert.deepEqual(row.args,[`scripts/${script}`]);assert.deepEqual(row.artifacts,[{path,fresh:true}]);assert.ok(p.checks.indexOf(find("native-room-participant-inventory"))<p.checks.indexOf(row));}
 }
 const installed=readFileSync(join(repository,"scripts/check-generation-room-installed.mjs"),"utf8");for(const text of ["buildRoomParticipantInventoryFixtures({saveReport:false})","sourceUnchanged:true","types-room-participant-inventory.ts","cohorts:240","participants:480","coldParticipants:480","releaseRetries:30","lastGuardRetirementRefusals:30","generation_source/native_read.js","room_participant_inventory/generation_coverage.js"])assert.ok(installed.includes(text),text);
 const managed=readFileSync(join(repository,"scripts/check-generation-assets-installed.mjs"),"utf8");for(const text of ["tests:362","coreRetirementCases:15","sourceCallbackGuardCases:6","uploadHandoffCases:12"])assert.ok(managed.includes(text),text);
 for(const name of ["inventory","custody"]){const sdk=readFileSync(join(repository,`scripts/check-generation-room-${name}-sdk.mjs`),"utf8");assert.ok(sdk.includes("assert.deepEqual(native.source,source"));assert.ok(sdk.includes("fileEvidence(root,file.path)"));assert.ok(sdk.includes("assert.deepEqual(sourceEvidence(root),source)"));}
});

test("both profiles require the common mixed barrier and unchanged native cleanup assertions in fresh archives",()=>{
 for(const profile of ['functional','full']){const p=candidateReleasePlan({profile}),find=id=>{const c=p.checks.find(c=>c.id===id);assert.ok(c,id);return c;};assert.deepEqual(find('operation-cohort-contracts').args,['--test','scripts/operation-cohort.test.mjs']);const row=find('mixed-room-custody');assert.deepEqual(row.args,['scripts/check-mixed-room-custody-sdk.mjs']);assert.deepEqual(row.artifacts,[{path:'target/mixed-room-custody-sdk.json',fresh:true}]);assert.ok(p.checks.indexOf(find('native-room-participant-inventory'))<p.checks.indexOf(row));}
 const installed=readFileSync(join(repository,'scripts/check-generation-room-installed.mjs'),'utf8');for(const text of ['probe-mixed-room-custody.mjs','probe-operation-cohort-cleanup.mjs','operation-cohort/original-participant.mjs','cohorts:480','coldParticipants:960','destructorRefusals:120','operation_cohort/cohort.js','mixed_room_operation/custody.js','executeCandidateStage','saveEvidence(childReport','if(child.status!==\'passed\')'])assert.ok(installed.includes(text),text);
 const sdk=readFileSync(join(repository,'scripts/check-mixed-room-custody-sdk.mjs'),'utf8');for(const text of ['assert.deepEqual(native.source,source','fileEvidence(root,file.path)','assert.deepEqual(sourceEvidence(root),source)','probeOperationCohortCleanup','probeMixedRoomCustody'])assert.ok(sdk.includes(text),text);
});

test('binding refusals remain mandatory before captured readers in source and installed native cohorts',()=>{
 for(const profile of ['functional','full']){const p=candidateReleasePlan({profile}),row=p.checks.find(c=>c.id==='managed-source-binding-contracts');assert.ok(row);assert.deepEqual(row.args,['--test','scripts/managed-source-bindings.test.mjs']);}
 const installed=readFileSync(join(repository,'scripts/check-generation-room-installed.mjs'),'utf8');for(const text of ['probe-managed-source-bindings.mjs','cohorts:120','coldParticipants:240','accessorInvocations:0','managed_source_bindings.js'])assert.ok(installed.includes(text),text);
 const sdk=readFileSync(join(repository,'scripts/check-mixed-room-custody-sdk.mjs'),'utf8');assert.ok(sdk.includes('probeManagedSourceBindings'));assert.ok(sdk.includes('assert.equal(bindings.passed,true)'));
});

test("both profiles require complete generation assets, restartable participants, strict types and fresh public archives",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const c=p.checks.find(c=>c.id===id);assert.ok(c,id);return c;};
  assert.deepEqual(find("generation-assets-source-contracts").args,["--test","scripts/generation-asset-source.test.mjs"]);
  assert.ok(find("generation-assets-type-fence").args.includes("scripts/fixtures/editor-consumer/types-generation-assets.ts"));
  assert.deepEqual(find("installed-generation-assets").artifacts,[{path:"target/generation-assets-installed-consumer.json",fresh:true},{path:"target/generation-assets-installed-consumer.tap",fresh:true},{path:"target/generation-assets-installed-child.json",fresh:true}]);
 }
 const installed=readFileSync(join(repository,"scripts/check-generation-assets-installed.mjs"),"utf8");for(const text of ["generation-asset-source.test.mjs","types-generation-assets.ts","tests:362","documentOnlyProfileCases:18","generation_participant/recovery.js","generation_operation/origin.js","operationalPolicyMatrixCases:216","uploadHandoffCases:12","sourceUnchanged:true","executeCandidateStage","saveEvidence(childReport,childEvidence)","generation-assets-installed-child.json","if(child.status!=='passed')"])assert.ok(installed.includes(text),text);
});

test("both profiles require genuine operational generation custody and full installed authenticated reconnect",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const c=p.checks.find(c=>c.id===id);assert.ok(c,id);return c;};
  assert.ok(find("generation-operation-type-fence").args.includes("scripts/fixtures/editor-consumer/types-generation-operation.ts"));
  assert.ok(p.checks.indexOf(find("generation-operation-live"))>p.checks.indexOf(find("segmented-retained-native-host")));
  assert.deepEqual(find("installed-generation-operation").artifacts,[{path:"target/generation-operation-installed-consumer.json",fresh:true}]);
 }
 const installed=readFileSync(join(repository,"scripts/check-generation-operation-installed.mjs"),"utf8");for(const text of ["probe-generation-operation.mjs","types-generation-operation.ts","operationalColdReopens:18","operationHandoffs:24","generation_operation/origin.js","sourceUnchanged:true"])assert.ok(installed.includes(text),text);
});

test("both profiles retain original workflows and require real native late-handoff refusals in public archives",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const c=p.checks.find(c=>c.id===id);assert.ok(c,id);return c;};assert.ok(find("participant-operation").args.includes("scripts/probe-participant-operation.mjs"));assert.ok(find("room-operational-recovery").args.includes("scripts/check-room-operational-recovery-sdk.mjs"));assert.ok(find("installed-session-backups").artifacts.some(a=>a.path==="target/room-operational-recovery-installed-consumer.json"&&a.fresh));}
 const installed=readFileSync(join(repository,"scripts/check-session-backups-installed.mjs"),"utf8");for(const text of ["fixtures/participant-recovery/handoff-boundaries.mjs","fixtures/room-operation/handoff-boundaries.mjs","participantOperation.handoffBoundaries","roomOperationalRecovery.handoffBoundaries","readyAuthority:66","operationalAbort:66","readyCallbackAbort:2","coldReopens:268","nativeRooms:10","retainedFiles:60"])assert.ok(installed.includes(text),text);
 for(const name of ["participant-recovery","room-operation"]){const fixture=readFileSync(join(repository,"scripts/fixtures",name,"handoff-boundaries.mjs"),"utf8");assert.ok(fixture.includes("await close.apply(this,args)"));assert.ok(fixture.includes("controller.abort()"));assert.ok(fixture.includes("await assert.rejects(owner.intoParts()"));}
});

test("native managed-source retirement regressions remain mandatory in source and fresh installed consumers",()=>{
 const installed=readFileSync(join(repository,"scripts/check-session-backups-installed.mjs"),"utf8");for(const text of ["participant-recovery/managed-handoffs.mjs","room-operation/managed-handoffs.mjs","participantOperation.managedHandoffs","roomOperationalRecovery.managedHandoffs","readySourceUpgrade:66","operationalCoreRetire:66","freshRecoveries:264","sourceUpgradeRefusals:20","lateRetiredChildRefusals:10"])assert.ok(installed.includes(text),text);
 for(const[probe,fixture]of [["probe-participant-operation.mjs","participant-recovery"],["probe-room-operational-recovery.mjs","room-operation"]]){assert.ok(readFileSync(join(repository,"scripts",probe),"utf8").includes(`./fixtures/${fixture}/managed-handoffs.mjs`));const source=readFileSync(join(repository,"scripts/fixtures",fixture,"managed-handoffs.mjs"),"utf8");assert.ok(source.includes("await close.apply(this,args)"));assert.ok(source.includes(".retire()"));assert.ok(source.includes(".stores"));}
});

test("both profiles require genuine dependent-owner handoff, retry controls and installed room custody",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const c=p.checks.find(c=>c.id===id);assert.ok(c,id);return c;};assert.ok(find("retained-owner-upgrade-handoffs").args.includes("upgrade"));assert.ok(find("retained-owner-save-retries").args.includes("retry"));assert.ok(p.checks.indexOf(find("retained-room-owner-handoffs"))>p.checks.indexOf(find("room-operational-recovery")));assert.ok(find("installed-session-backups").artifacts.some(a=>a.path==="target/retained-owner-handoffs-installed-consumer.json"&&a.fresh));}
 const installed=readFileSync(join(repository,"scripts/check-session-backups-installed.mjs"),"utf8");for(const text of ["fixtures/participant-recovery/retained-handoffs.mjs","fixtures/room-operation/retained-handoffs.mjs","cases:312","retryableSaveHandoffs:180","parentUpgradeRefusals:40","lastCallbackUploadCloseRefusals:10","sourceUnchanged:true"])assert.ok(installed.includes(text),text);
 const generation=readFileSync(join(repository,"scripts/check-generation-assets-installed.mjs"),"utf8");assert.ok(generation.includes("tests:362"));assert.ok(generation.includes("uploadHandoffCases:12"));
});

test("both profiles require permanent observer generation custody and fresh public archives",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const c=p.checks.find(c=>c.id===id);assert.ok(c,id);return c;};
  assert.deepEqual(find("segmented-observer-storage-contracts").args,["--test","scripts/segmented-observer-storage.test.mjs"]);
  assert.ok(find("segmented-observer-type-fence").args.includes("scripts/fixtures/editor-consumer/types-segmented-observer.ts"));
  assert.ok(p.checks.indexOf(find("segmented-observer-live"))>p.checks.indexOf(find("segmented-retained-native-host")));
  assert.deepEqual(find("installed-segmented-observer").artifacts,[{path:"target/segmented-observer-installed-consumer.json",fresh:true}]);
 }
 const installed=readFileSync(join(repository,"scripts/check-segmented-observer-installed.mjs"),"utf8");for(const text of ["probe-segmented-observer.mjs","types-segmented-observer.ts","coldReopens:24","observerSeals:12","readerDocumentSubmissions:0","observer_factory.js"])assert.ok(installed.includes(text),text);
});

test("both profiles require atomic generation retained stores, original delivery regressions and fresh public archive proof",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const c=p.checks.find(c=>c.id===id);assert.ok(c,id);return c;};
  assert.deepEqual(find("segmented-retained-storage-contracts").args,["--test","scripts/segmented-retained-storage.test.mjs"]);
  assert.ok(find("segmented-retained-type-fence").args.includes("scripts/fixtures/editor-consumer/types-segmented-retained.ts"));
  assert.ok(find("segmented-retained-native-host").args.includes("suggestion_revisions_functional"));assert.equal(find("segmented-retained-native-host").artifacts.length,1);
  assert.ok(p.checks.indexOf(find("segmented-retained-live"))>p.checks.indexOf(find("segmented-retained-native-host")));
  assert.ok(find("legacy-revisions-live").args.includes("scripts/probe-suggestion-revisions-sdk.mjs"));
  assert.deepEqual(find("installed-segmented-retained").artifacts,[{path:"target/segmented-retained-installed-consumer.json",fresh:true}]);
 }
});

test("both profiles qualify explicit relay-generation storage, exact native host and fresh installed live workflows",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const c=p.checks.find(c=>c.id===id);assert.ok(c,id);return c;};
  assert.deepEqual(find("segmented-relay-storage-contracts").args,["--test","scripts/segmented-relay-storage.test.mjs"]);
  assert.ok(find("segmented-relay-type-fence").args.includes("scripts/fixtures/editor-consumer/types-segmented-relay.ts"));
  assert.ok(find("segmented-relay-native-host").args.includes("segmented_relay_functional"));assert.equal(find("segmented-relay-native-host").artifacts.length,2);
  assert.ok(find("legacy-review-relay-live").args.includes("scripts/probe-review-relay-sdk.mjs"));
  assert.ok(p.checks.indexOf(find("segmented-relay-live"))>p.checks.indexOf(find("segmented-relay-native-host")));
  assert.equal(find("segmented-relay-v2-negative").args.at(-1),"--smoke");
  assert.deepEqual(find("installed-segmented-relay").artifacts,[{path:"target/segmented-relay-installed-consumer.json",fresh:true}]);
 }
});

test("both profiles require explicit generation storage, public types, the full native-owner matrix and fresh installed archives",()=>{
 for(const profile of ["functional","full"]){
  const p=candidateReleasePlan({profile}),find=id=>{const c=p.checks.find(c=>c.id===id);assert.ok(c,id);return c;};
  assert.deepEqual(find("segmented-storage-contracts").args,["--test","scripts/segmented-history-storage.test.mjs"]);
  assert.deepEqual(find("native-history-consumer-contracts").args,["--test","scripts/canonical-native-history-dependencies.test.mjs"]);
  assert.ok(find("segmented-history-type-fence").args.includes("scripts/fixtures/editor-consumer/types-segmented-history.ts"));
  assert.deepEqual(find("segmented-history-sdk").args,["scripts/probe-segmented-history-sdk.mjs","target/promoted-shared-web"]);
  assert.ok(p.checks.indexOf(find("segmented-history-sdk"))>p.checks.indexOf(find("collaboration-build")));
  assert.deepEqual(find("installed-segmented-history").args,["scripts/check-segmented-history-installed.mjs"]);
  assert.deepEqual(find("installed-segmented-history").artifacts,[{path:"target/segmented-history-installed-consumer.json",fresh:true}]);
 }
});

test("both profiles require explicit whole-upload recovery, real native checks and fresh installed consumers",()=>{
 for(const profile of["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const c=p.checks.find(c=>c.id===id);assert.ok(c,id);return c;};assert.deepEqual(find("upload-reconciliation-contracts").args,["--test","scripts/asset-reconciliation.test.mjs"]);assert.ok(find("upload-reconciliation-type-fence").args.includes("scripts/fixtures/editor-consumer/types-upload-reconciliation.ts"));assert.deepEqual(find("upload-reconciliation").args,["scripts/check-upload-reconciliation-sdk.mjs"]);assert.deepEqual(find("upload-reconciliation").artifacts,[{path:"target/upload-reconciliation-sdk.json",fresh:true}]);assert.ok(p.checks.indexOf(find("upload-reconciliation"))>p.checks.indexOf(find("collaboration-build")));assert.ok(find("installed-session-backups").artifacts.some(r=>r.path==="target/upload-reconciliation-installed-consumer.json"&&r.fresh));}
 const installed=readFileSync(join(repository,"scripts/check-session-backups-installed.mjs"),"utf8");for(const text of["upload-reconciliation-probe.mjs","types-upload-reconciliation.ts","coldAttemptReopens:132","futureReviewCheckpoints:90","wrongOriginalRefusals:1","recoveryNotifications:0","uploadReconciliation.originalPaired,participantRecovery","/assets/reconciliation/","uploadReport"])assert.ok(installed.includes(text),text);
});

test("both profiles require native pending-work recovery, group contracts and fresh installed packages",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const c=p.checks.find(c=>c.id===id);assert.ok(c,id);return c;};assert.deepEqual(find("pending-recovery-contracts").args,["--test","scripts/pending-reconciliation.test.mjs"]);assert.ok(find("pending-recovery-type-fence").args.includes("scripts/fixtures/editor-consumer/types-pending-recovery.ts"));assert.deepEqual(find("pending-recovery").args,["scripts/check-pending-recovery-sdk.mjs"]);assert.deepEqual(find("pending-recovery").artifacts,[{path:"target/pending-recovery-sdk.json",fresh:true}]);assert.ok(p.checks.indexOf(find("pending-recovery"))>p.checks.indexOf(find("collaboration-build")));assert.ok(find("installed-session-backups").artifacts.some(r=>r.path==="target/pending-recovery-installed-consumer.json"&&r.fresh));}
 const installed=readFileSync(join(repository,"scripts/check-session-backups-installed.mjs"),"utf8");for(const text of ["pending-recovery-probe.mjs","types-pending-recovery.ts","coldStoreReopens:120","concurrentRefusals:986","delayedConnectRefusals:2","openingAuthorityChecks:7","openingFailureReopens:1","reentrantOpeningRefusals:7","failedSubscriptionRefusals:1","/suggestions/recovery_gate.js","/suggestion_revisions/reconcile_retained.js","pendingReport"])assert.ok(installed.includes(text),text);
});

test("both candidate profiles require actual local retained-version recovery and fresh public consumers",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const c=p.checks.find(c=>c.id===id);assert.ok(c,id);return c;};assert.deepEqual(find("retained-version-recovery-contracts").args,["--test","scripts/version-reconciliation.test.mjs"]);assert.ok(find("retained-version-recovery-type-fence").args.includes("scripts/fixtures/editor-consumer/types-retained-version-recovery.ts"));assert.deepEqual(find("retained-version-recovery").args,["scripts/check-retained-version-recovery-sdk.mjs"]);assert.deepEqual(find("retained-version-recovery").artifacts,[{path:"target/retained-version-recovery-sdk.json",fresh:true}]);assert.ok(p.checks.indexOf(find("retained-version-recovery"))>p.checks.indexOf(find("collaboration-build")));assert.ok(find("installed-session-backups").artifacts.some(row=>row.path==="target/retained-version-recovery-installed-consumer.json"&&row.fresh));}
 const installed=readFileSync(join(repository,"scripts/check-session-backups-installed.mjs"),"utf8");for(const text of ["retained-version-recovery-probe.mjs","types-retained-version-recovery.ts","retainedCurrentPackets:30","coldReopens:60","futureNativeHistoryComparisons:180","committedBeforeAcknowledgementRetries:1","/versions/reconcile_retained.js","/participant_replay/version_record.js","retainedVersionReport"])assert.ok(installed.includes(text),text);
});

test("functional and full plans cover current candidate work without weakening the default release",()=>{
 const functional=candidateReleasePlan({profile:"functional"}),full=candidateReleasePlan();
 assert.equal(functional.v1Ready,false);assert.equal(full.v1Ready,false);
 assert.ok(Object.isFrozen(full)&&Object.isFrozen(full.checks));
 assert.deepEqual(full.checks.slice(0,functional.checks.length),functional.checks);
 const ids=full.checks.map(check=>check.id);assert.equal(new Set(ids).size,ids.length);
 for(const id of ["workspace-lint","shared-lint","relay-lint","workspace-native","shared-native","relay-native","independent-native-consumer","paired-local-runtime","paired-shared-runtime","editor-sdk-tests","installed-rich-interchange","installed-everyday-mixed-workflows","installed-text-review-and-readers","installed-formatting-review-and-readers","installed-assets-comments-versions","default-package-release-matrix","installed-editor-browser-matrix","reviewed-v1-readiness"])assert.ok(ids.includes(id),id);
 assert.equal(full.checks.at(-1).args.at(-1),"--require-ready");
 assert.ok(!functional.checks.some(check=>check.id==="reviewed-v1-readiness"));
 assert.ok(functional.deferred.includes("native-clipboard-ime-screen-reader-mobile"));
 for(const id of ["search-programmatic-sdk","search-persistent-sessions","search-borrowed-controls","search-managed-startup","installed-search-workflows"])assert.ok(functional.checks.some(check=>check.id===id),id);
 const search=functional.checks.find(check=>check.id==="installed-search-workflows");assert.deepEqual(search.args,["scripts/check-search-installed.mjs"]);assert.deepEqual(search.artifacts,[{path:"target/search-installed-consumer.json",fresh:true}]);
 assert.ok(!functional.checks.some(check=>check.id==="installed-search-browser"));const searchBrowser=full.checks.find(check=>check.id==="installed-search-browser");assert.deepEqual(searchBrowser.args,["scripts/check-search-browser.mjs"]);assert.deepEqual(searchBrowser.artifacts,[{path:"target/search-installed-browser.json",fresh:true}]);
 assert.throws(()=>candidateReleasePlan({profile:"skip-hard-parts"}));
 for(const check of full.checks){assert.ok(Object.isFrozen(check)&&Object.isFrozen(check.args)&&Object.isFrozen(check.artifacts));assert.ok(!check.args.some(arg=>/^(publish|push|tag|--skip-tests|--retries)$/.test(arg)));}
});
test("candidate relay tests isolate independent subprocess fixtures",()=>{
 const checks=candidateReleasePlan().checks;
 const relayTests=checks.filter(check=>check.args[0]==="test"&&check.args.includes("experiments/relay/Cargo.toml"));
 assert.ok(relayTests.some(check=>check.id==="relay-native"));
 assert.ok(relayTests.some(check=>check.id==="relay-native-generation-activation-native"));
 assert.ok(relayTests.every(check=>check.env.RUST_TEST_THREADS==="1"));
 assert.equal(checks.find(check=>check.id==="workspace-native").env.RUST_TEST_THREADS,undefined);
});
test("both profiles strictly lint the relay without server-only helpers or default features",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile,environment:{BREDITOR_CARGO:"/tool path/cargo"}}),check=p.checks.find(c=>c.id==="relay-no-server-lint");assert.ok(check);assert.equal(check.command,"/tool path/cargo");assert.deepEqual(check.args,["clippy","--manifest-path","experiments/relay/Cargo.toml","--no-default-features","--all-targets","--locked","--offline","--release","--","-D","warnings"]);assert.equal(check.env.CARGO_TARGET_DIR,p.checks.find(c=>c.id==="relay-native").env.CARGO_TARGET_DIR);assert.ok(!check.args.includes("--features"));}
});
test("manifest flags precede formatter/linter separators and overrides stay one argv item",()=>{
 const p=candidateReleasePlan({profile:"functional",environment:{BREDITOR_CARGO:"/tool path/cargo",BREDITOR_NPM:"/tool path/npm"}});
 for(const id of ["shared-format","relay-format","shared-lint","relay-lint"]){const c=p.checks.find(c=>c.id===id);assert.equal(c.command,"/tool path/cargo");assert.ok(c.args.indexOf("--manifest-path")<c.args.indexOf("--"));}
 for(const id of ["workspace-lint","shared-lint","relay-lint"]){const c=p.checks.find(c=>c.id===id);for(const arg of ["--all-targets","--locked","--offline"])assert.ok(c.args.includes(arg));assert.deepEqual(c.args.slice(-3),["--","-D","warnings"]);}
 assert.equal(p.checks.find(c=>c.id==="editor-sdk-tests").command,"/tool path/npm");
 assert.equal(p.checks.find(c=>c.id==="functional-native-fixtures").artifacts.length,5);
 const wasm=p.checks.find(c=>c.id==="shared-wasm-lint");assert.ok(wasm.env.CARGO_ENCODED_RUSTFLAGS.includes(`--remap-path-prefix=${repository}=breditor`),"Actual-target lint must use the same canonical Rust flags as the shipped candidate");
});
test("both profiles compile shared public documentation with warnings denied",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile,environment:{BREDITOR_CARGO:"/tool path/cargo"}}),docs=plan.checks.find(c=>c.id==="shared-docs"),native=plan.checks.find(c=>c.id==="shared-native");assert.ok(docs);assert.equal(docs.command,"/tool path/cargo");assert.deepEqual(docs.args,["doc","--manifest-path","crates/breditor-collaboration/Cargo.toml","--no-deps","--locked","--offline","--release"]);assert.equal(docs.env.RUSTDOCFLAGS,"-D warnings");assert.equal(docs.env.CARGO_TARGET_DIR,native.env.CARGO_TARGET_DIR);assert.ok(plan.checks.indexOf(docs)>plan.checks.indexOf(native));}
});
test("both profiles exercise public server and offline host recovery plus strict native documentation",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile,environment:{BREDITOR_CARGO:"/tool path/cargo"}}),check=plan.checks.find(row=>row.id==="relay-room-backups"),offline=plan.checks.find(row=>row.id==="relay-backups-no-server"),docs=plan.checks.find(row=>row.id==="relay-docs");assert.equal(check.command,"/tool path/cargo");assert.deepEqual(check.args,["test","--manifest-path","experiments/relay/Cargo.toml","--features","server","--locked","--offline","--release","--test","room_backups"]);assert.equal(check.env.CARGO_TARGET_DIR,plan.checks.find(row=>row.id==="relay-native").env.CARGO_TARGET_DIR);assert.deepEqual(offline.args,["test","--manifest-path","experiments/relay/Cargo.toml","--locked","--offline","--release","--lib","--test","room_backups"]);assert.equal(offline.env.CARGO_TARGET_DIR,check.env.CARGO_TARGET_DIR);assert.equal(docs.env.RUSTDOCFLAGS,"-D warnings");assert.deepEqual(docs.args,["doc","--manifest-path","experiments/relay/Cargo.toml","--features","server","--no-deps","--locked","--offline","--release"]);}
});
test("both profiles require actual paired native retained-image reads without a historical cache dependency",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile}),check=plan.checks.find(c=>c.id==="retained-image-references");assert.ok(check);assert.deepEqual(check.args,["scripts/probe-retained-asset-references.mjs","target/rich-browser-web","target/promoted-shared-web"]);assert.ok(plan.checks.indexOf(check)>plan.checks.findIndex(c=>c.id==="paired-shared-runtime"));}
});
test("both profiles retain server asset recovery, exact owner-path regressions and network-disabled host APIs",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile,environment:{BREDITOR_CARGO:"/tool path/cargo"}}),native=plan.checks.find(row=>row.id==="relay-native");for(const [id,tail]of [["relay-asset-backups",["--features","server","--locked","--offline","--release","--test","asset_backups"]],["relay-asset-owner-paths",["--features","server","--locked","--offline","--release","--test","asset_store_paths"]],["relay-assets-no-server",["--locked","--offline","--release","--lib","--test","asset_backups","--test","asset_store_paths"]]]){const check=plan.checks.find(row=>row.id===id);assert.ok(check,id);assert.equal(check.command,"/tool path/cargo");assert.deepEqual(check.args,["test","--manifest-path","experiments/relay/Cargo.toml",...tail]);assert.equal(check.env.CARGO_TARGET_DIR,native.env.CARGO_TARGET_DIR);assert.ok(plan.checks.indexOf(check)>plan.checks.indexOf(native));}}
});
test("both profiles require current packet/source capture and version ownership checks without historical caches",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile});for(const [id,file]of [["packet-asset-references","probe-packet-asset-references.mjs"],["version-source-ownership","probe-version-source-ownership.mjs"]]){const check=plan.checks.find(c=>c.id===id);assert.ok(check);assert.deepEqual(check.args,[`scripts/${file}`,"target/promoted-shared-web"]);assert.ok(plan.checks.indexOf(check)>plan.checks.findIndex(c=>c.id==="collaboration-build"));}}
});
test("both profiles require atomic source-upload cuts, the exact cancellation regression and participant native restores",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile}),find=id=>{const row=plan.checks.find(s=>s.id===id);assert.ok(row,id);return row;};assert.deepEqual(find("asset-source-snapshot-contracts").args,["--test","scripts/asset-source-backups.test.mjs"]);assert.deepEqual(find("asset-source-cancellation-regression").args,["--test","--test-name-pattern=cancellation before or within","scripts/asset-source-backups.test.mjs"]);assert.deepEqual(find("participant-backups").args,["scripts/probe-participant-backups.mjs","target/promoted-shared-web"]);assert.ok(plan.checks.indexOf(find("participant-backups"))>plan.checks.indexOf(find("collaboration-build")));assert.deepEqual(find("installed-session-backups").args,["scripts/check-session-backups-installed.mjs"]);}
});
test("both profiles require joined server recovery, real host capture and the non-networked host APIs",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile,environment:{BREDITOR_CARGO:"/tool path/cargo"}}),native=plan.checks.find(row=>row.id==="relay-native");for(const [id,flags]of [["relay-server-room-backups",["--features","server"]],["relay-server-backups-no-server",[]]]){const check=plan.checks.find(row=>row.id===id);assert.ok(check,id);assert.equal(check.command,"/tool path/cargo");assert.deepEqual(check.args,["test","--manifest-path","experiments/relay/Cargo.toml",...flags,"--locked","--offline","--release",...(flags.length?[]:["--lib"]),"--test","server_room_backups"]);assert.equal(check.env.CARGO_TARGET_DIR,native.env.CARGO_TARGET_DIR);assert.ok(plan.checks.indexOf(check)>plan.checks.indexOf(native));}}
});
test("both profiles require owner-authenticated participant inventory and the non-networked native API",()=>{
 for(const profile of ["functional","full"]){
  const plan=candidateReleasePlan({profile,environment:{BREDITOR_CARGO:"/tool path/cargo"}}),native=plan.checks.find(row=>row.id==="relay-native");
  for(const [id,flags]of [["relay-participant-inventory",["--features","server"]],["relay-inventory-no-server",[]]]){
   const check=plan.checks.find(row=>row.id===id);assert.ok(check,id);assert.equal(check.command,"/tool path/cargo");
   assert.deepEqual(check.args,["test","--manifest-path","experiments/relay/Cargo.toml",...flags,"--locked","--offline","--release",...(flags.length?[]:["--lib"]),"--test","participant_inventory"]);
   assert.equal(check.env.CARGO_TARGET_DIR,native.env.CARGO_TARGET_DIR);assert.ok(plan.checks.indexOf(check)>plan.checks.indexOf(native));
  }
 }
});
test("both profiles require real physical log capacity, old-reader refusal and offline-history recovery with and without networking",()=>{
 for(const profile of ["functional","full"]){
  const plan=candidateReleasePlan({profile,environment:{BREDITOR_CARGO:"/tool path/cargo"}}),native=plan.checks.find(row=>row.id==="relay-native");
  for(const [id,flags]of [["relay-log-generations",["--features","server"]],["relay-log-generations-no-server",["--no-default-features"]]]){
   const check=plan.checks.find(row=>row.id===id);assert.ok(check,id);assert.equal(check.command,"/tool path/cargo");
   assert.deepEqual(check.args,["test","--manifest-path","experiments/relay/Cargo.toml",...flags,"--locked","--offline","--release","--test","log_generations"]);
   assert.equal(check.env.CARGO_TARGET_DIR,native.env.CARGO_TARGET_DIR);assert.ok(plan.checks.indexOf(check)>plan.checks.indexOf(native));
  }
 }
});
test("both profiles require retained-store recovery and fresh installed backup acceptance without reuse",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),check=p.checks.find(c=>c.id==="retained-store-backups"),installed=p.checks.find(c=>c.id==="installed-session-backups");assert.deepEqual(check.args,["scripts/probe-retained-store-backups.mjs","target/promoted-shared-web"]);assert.deepEqual(installed.args,["scripts/check-session-backups-installed.mjs"]);assert.ok(p.checks.indexOf(check)>p.checks.findIndex(c=>c.id==="collaboration-build"));}
});
test("both profiles require complete selected asset bytes through the current native runtime",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile}),check=plan.checks.find(row=>row.id==="selected-asset-bytes");assert.deepEqual(check.args,["scripts/probe-selected-asset-bytes.mjs","target/promoted-shared-web"]);assert.ok(plan.checks.indexOf(check)>plan.checks.findIndex(row=>row.id==="collaboration-build"));}
});
test("both profiles require exact shared backups and startup upgrade admission without a runtime reuse shortcut",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile}),find=id=>{const value=plan.checks.find(c=>c.id===id);assert.ok(value,id);return value;};
  for(const [id,file]of [["shared-session-backups","probe-session-backups.mjs"],["shared-asset-archive-history","probe-shared-asset-backups.mjs"],["paired-session-backups","probe-paired-backups.mjs"],["session-opening-upgrade-fence","probe-session-opening-upgrade.mjs"]])assert.deepEqual(find(id).args,[`scripts/${file}`,"target/promoted-shared-web"]);
  const installed=find("installed-session-backups");assert.deepEqual(installed.args,["scripts/check-session-backups-installed.mjs"]);assert.deepEqual(installed.artifacts,[{path:"target/session-backups-installed-consumer.json",fresh:true,retain:true},{path:"target/participant-operation-installed-consumer.json",fresh:true},{path:"target/catalog-participant-operation-installed-consumer.json",fresh:true},{path:"target/room-operational-recovery-installed-consumer.json",fresh:true},{path:"target/participant-replay-installed-consumer.json",fresh:true},{path:"target/retained-version-recovery-installed-consumer.json",fresh:true},{path:"target/pending-recovery-installed-consumer.json",fresh:true},{path:"target/upload-reconciliation-installed-consumer.json",fresh:true},{path:"target/retained-owner-handoffs-installed-consumer.json",fresh:true}]);
  const browser=plan.checks.find(c=>c.id==="installed-session-backups-browser");if(profile==="full"){assert.deepEqual(browser.args,["scripts/check-session-backups-browser.mjs"]);assert.deepEqual(browser.artifacts,[{path:"target/session-backups-installed-browser.json",fresh:true,retain:true}]);}else assert.equal(browser,undefined);
 }
});
test("both profiles require native retained-copy replay and its fresh installed public APIs",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile}),find=id=>{const check=plan.checks.find(c=>c.id===id);assert.ok(check,id);return check;};
  for(const name of ["participant-replay","room-replay"]){assert.ok(find(`${name}-type-fence`).args.includes(`scripts/fixtures/editor-consumer/types-${name}.ts`));assert.deepEqual(find(name).args,[`scripts/check-${name}-sdk.mjs`]);assert.deepEqual(find(name).artifacts,[{path:`target/${name}-sdk.json`,fresh:true}]);assert.ok(plan.checks.indexOf(find(name))>plan.checks.indexOf(find("collaboration-build")));}
  assert.ok(find("installed-session-backups").artifacts.some(row=>row.path==="target/participant-replay-installed-consumer.json"&&row.fresh));
 }
 const installed=readFileSync(join(repository,"scripts/check-session-backups-installed.mjs"),"utf8");for(const text of ["participant-replay-probe.mjs","room-replay-probe.mjs","types-participant-replay.ts","types-room-replay.ts","concurrentReadOnlyCopies:66","nativeDisposals:70","forbiddenCalls:0","reentrantSourceDisposals:1","participant-replay-bundle.mjs","/participant_replay/read.js","/room_replay/read.js","replayInstalledReport"])assert.ok(installed.includes(text),text);
});
test("asset archive contracts and fresh public packages are mandatory; full additionally requires native raster/reload acceptance",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile}),find=id=>{const check=plan.checks.find(c=>c.id===id);assert.ok(check,id);return check;};assert.deepEqual(find("asset-archive-storage-contracts").args,["--test","scripts/asset-backups.test.mjs"]);const installed=find("installed-asset-backups");assert.deepEqual(installed.args,["scripts/check-asset-backups-installed.mjs"]);assert.deepEqual(installed.artifacts,[{path:"target/asset-backups-installed-consumer.json",fresh:true}]);const browser=plan.checks.find(c=>c.id==="installed-asset-backups-browser");if(profile==="full"){assert.deepEqual(browser.args,["scripts/check-asset-backups-browser.mjs"]);assert.deepEqual(browser.artifacts,[{path:"target/asset-backups-installed-browser.json",fresh:true}]);}else assert.equal(browser,undefined);}
});
test("both candidate profiles require portable input rules without reusing or inventing historical fixtures",()=>{
 for(const profile of ["functional","full"]){
  const plan=candidateReleasePlan({profile}),find=id=>{const value=plan.checks.find(c=>c.id===id);assert.ok(value,id);return value;};
  assert.deepEqual(find("input-rules-borrowed-controls").args,["scripts/probe-input-rules-ui.mjs","--current-runtime-only","target/rich-browser-web","target/promoted-shared-web"]);
  assert.deepEqual(find("input-rules-managed-startup").args,["scripts/probe-input-rules-root-sdk.mjs","target/rich-browser-web","target/promoted-shared-web"]);
  const installed=find("installed-input-rule-workflows");assert.deepEqual(installed.args,["scripts/check-input-rules-installed.mjs","--current-runtime-only"]);assert.deepEqual(installed.artifacts,[{path:"target/input-rules-current-installed-consumer.json",fresh:true,retain:true}]);
  assert.ok(!installed.args.includes("--reuse-runtimes"));assert.ok(plan.deferred.includes("pinned-input-rule-historical-readers"));
  const index=id=>plan.checks.findIndex(c=>c.id===id);assert.ok(index("paired-local-runtime")<index("input-rules-borrowed-controls"));assert.ok(index("paired-shared-runtime")<index("input-rules-managed-startup"));assert.ok(index("installed-input-rule-workflows")<index("readiness-inventory"));
  assert.ok(plan.checks.every(c=>c.args.every(arg=>!arg.includes("input-rule-old-readers-")&&!arg.includes("input-rules-runtime-"))),"CI has no dependency on untracked historical caches");
 }
});
test("both profiles require complete current writing utilities, actual root React and fresh installed archives",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile}),find=id=>{const value=plan.checks.find(c=>c.id===id);assert.ok(value,id);return value;};
  assert.deepEqual(find("writing-tools-native-sdk-and-controls").args,["scripts/probe-writing-tools.mjs","target/rich-browser-web","target/promoted-shared-web"]);
  assert.deepEqual(find("writing-tools-managed-startup").args,["scripts/probe-writing-tools-root-sdk.mjs","target/rich-browser-web","target/promoted-shared-web"]);
  const installed=find("installed-writing-tools-workflows");assert.deepEqual(installed.args,["scripts/check-writing-tools-installed.mjs"]);assert.deepEqual(installed.artifacts,[{path:"target/writing-tools-installed-consumer.json",fresh:true,retain:true}]);assert.ok(!installed.args.includes("--reuse-runtimes"));
  assert.ok(plan.checks.findIndex(c=>c.id==="paired-shared-runtime")<plan.checks.findIndex(c=>c.id==="writing-tools-native-sdk-and-controls"));assert.ok(plan.checks.findIndex(c=>c.id==="installed-writing-tools-workflows")<plan.checks.findIndex(c=>c.id==="readiness-inventory"));
 }
});
test("clean candidate SDK prerequisites and explicit rich types precede dependent checks in both profiles",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),index=id=>{const n=p.checks.findIndex(c=>c.id===id);assert.ok(n>=0,id);return n;},find=id=>p.checks[index(id)];
  assert.deepEqual(find("rich-browser-build").args,["node_modules/typescript/bin/tsc","-p","packages/breditor-experimental-rich-content/tsconfig.json"]);
  assert.deepEqual(find("rich-browser-types").args,["node_modules/typescript/bin/tsc","-p","packages/breditor-experimental-rich-content/tsconfig.json","--noEmit"]);
  assert.equal(find("rich-browser-build").command,process.execPath);assert.equal(find("rich-browser-types").command,process.execPath);
  assert.ok(index("paired-shared-runtime")<index("rich-browser-build"));assert.ok(index("rich-browser-build")<index("collaboration-build"));assert.ok(index("collaboration-build")<index("editor-build"));assert.ok(index("editor-build")<index("clean-candidate-sdk-build"));
  for(const id of ["search-programmatic-sdk","input-rules-borrowed-controls","writing-tools-native-sdk-and-controls","installed-editor-pairing"])assert.ok(index("clean-candidate-sdk-build")<index(id));
  const clean=find("clean-candidate-sdk-build");assert.deepEqual(clean.args,["scripts/check-candidate-sdk-build.mjs"]);assert.deepEqual(clean.artifacts,[{path:"target/candidate-sdk-build.json",fresh:true}]);assert.ok(index("rich-browser-types")<index("readiness-inventory"));
 }
});
test("both profiles require portable fullscreen workflows and fresh acceptance; full adds native browser activation",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const row=p.checks.find(x=>x.id===id);assert.ok(row,id);return row;};assert.deepEqual(find("fullscreen-sdk-and-controls").args,["scripts/probe-fullscreen.mjs","target/rich-browser-web","target/promoted-shared-web"]);const installed=find("installed-fullscreen-workflows");assert.deepEqual(installed.args,["scripts/check-fullscreen-installed.mjs"]);assert.deepEqual(installed.artifacts,[{path:"target/fullscreen-installed-consumer.json",fresh:true}]);assert.ok(!installed.args.includes("--reuse-runtimes"));assert.ok(p.checks.findIndex(x=>x.id==="editor-build")<p.checks.findIndex(x=>x.id==="fullscreen-sdk-and-controls"));assert.ok(p.checks.findIndex(x=>x.id==="installed-fullscreen-workflows")<p.checks.findIndex(x=>x.id==="readiness-inventory"));if(profile==="full"){const browser=find("installed-fullscreen-browser");assert.deepEqual(browser.args,["scripts/check-fullscreen-browser.mjs"]);assert.deepEqual(browser.artifacts,[{path:"target/fullscreen-installed-browser.json",fresh:true}]);}else assert.ok(!p.checks.some(x=>x.id==="installed-fullscreen-browser"));}
});
test("both profiles require current native placeholder workflows and fresh isolated acceptance",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const r=p.checks.find(s=>s.id===id);assert.ok(r,id);return r;};assert.deepEqual(find("placeholder-native-sdk-and-controls").args,["scripts/probe-placeholder.mjs","target/rich-browser-web","target/promoted-shared-web"]);const installed=find("installed-placeholder-workflows");assert.deepEqual(installed.args,["scripts/check-placeholder-installed.mjs"]);assert.deepEqual(installed.artifacts,[{path:"target/placeholder-installed-consumer.json",fresh:true}]);assert.ok(!installed.args.includes("--reuse-runtimes"));assert.ok(p.checks.findIndex(s=>s.id==="rich-browser-build")<p.checks.findIndex(s=>s.id==="placeholder-native-sdk-and-controls"));assert.ok(p.checks.findIndex(s=>s.id==="installed-placeholder-workflows")<p.checks.findIndex(s=>s.id==="readiness-inventory"));if(profile==="full"){const browser=find("installed-placeholder-browser");assert.deepEqual(browser.args,["scripts/check-placeholder-browser.mjs"]);assert.deepEqual(browser.artifacts,[{path:"target/placeholder-installed-browser.json",fresh:true}]);}else assert.ok(!p.checks.some(s=>s.id==="installed-placeholder-browser"));}
});
test("dry run is cwd-independent and explicitly cannot imply V1 readiness",()=>{
 const script=join(repository,"scripts/verify-candidate.mjs"),r=spawnSync(process.execPath,[script,"--functional","--dry-run"],{cwd:tmpdir(),encoding:"utf8"});assert.equal(r.status,0,r.stderr);const p=JSON.parse(r.stdout);assert.equal(p.executed,false);assert.equal(p.v1Ready,false);assert.equal(p.profile,"functional");assert.ok(p.deferred.length>0);
 for(const args of [["--skip-tests"],["--functional","--functional"],["--help","--functional"]]){const bad=spawnSync(process.execPath,[script,...args],{encoding:"utf8"});assert.equal(bad.status,2);assert.equal(bad.stdout,"");}
 const help=spawnSync(process.execPath,[script,"--help"],{encoding:"utf8"});assert.equal(help.status,0);assert.match(help.stdout,/not V1 readiness/);
});
test("the full workspace script suite follows the Native producer stages",()=>{
 for(const profile of ["full","functional"]){
  const {checks}=candidateReleasePlan({profile});
  const index=id=>checks.findIndex(check=>check.id===id);
  const suite=checks[index("typescript-tests-and-script-contracts")];
  assert.deepEqual(suite.args,["test"]);
  assert.equal(suite.requiresSharedRuntime,true);
  for(const id of ["paired-shared-runtime","editor-build","native-room-participant-inventory",
   "native-complete-image-cohort","selected-delivery-native-host","server-packet-inspection-native-host","functional-native-fixtures"]){
   assert.ok(index(id)>=0&&index(id)<index(suite.id),id);
  }
  assert.ok(index(suite.id)<index("readiness-inventory"));
 }
});
test("isolated release matrices preserve the full plan's commands and report their narrower scope",()=>{
 const script=join(repository,"scripts/verify-candidate.mjs");
 const full=candidateReleasePlan().checks;
 for(const [profile,ids] of [
  ["default-matrix",["default-package-release-matrix"]],
  ["editor-browser-matrix",["relay-native-dependency-notices","default-typescript-build","installed-editor-browser-matrix"]],
  ["rich-browser-matrix",["default-typescript-build","paired-local-runtime","rich-browser-build","rich-browser-chromium","rich-browser-firefox","rich-browser-webkit"]],
  ["shared-browser-matrix",[
   "relay-native-dependency-notices","default-typescript-build","paired-local-runtime","rich-browser-build",
   "shared-browser-wasm-build","shared-browser-wasm-bindgen","shared-browser-native-fixtures","shared-browser-vector",
   "shared-browser-raster-fixtures","shared-browser-typescript-build","shared-browser-matrix",
  ]],
  ["installed-application-network",[
   "relay-native-dependency-notices","default-typescript-build","installed-editor-pairing",
   "shared-browser-vector","shared-browser-raster-fixtures","installed-application-network-matrix",
  ]],
  ["portable-relay-recovery",[
   "default-typescript-build","paired-local-runtime","paired-shared-runtime","rich-browser-build","collaboration-build",
   "functional-native-fixtures","portable-relay-relocation","portable-relay-legacy-handover",
  ]],
  ["dependency-inventories",["relay-native-dependency-notices","paired-local-runtime","paired-shared-runtime"]],
  ["installed-distribution-workflows",[
   "default-typescript-build","paired-local-runtime","paired-shared-runtime","rich-browser-build","collaboration-build",
   "installed-rich-interchange","functional-native-fixtures","installed-everyday-mixed-workflows",
   "installed-text-review-and-readers","installed-formatting-review-and-readers","installed-assets-comments-versions",
  ]],
  ["input-writing-workflows",[
   "default-typescript-build","paired-local-runtime","paired-shared-runtime","rich-browser-build","collaboration-build","editor-build",
   "input-rules-borrowed-controls","input-rules-managed-startup","writing-tools-native-sdk-and-controls","writing-tools-managed-startup",
   "installed-input-rule-workflows","installed-writing-tools-workflows",
  ]],
  ["installed-feature-browser",[
   "default-typescript-build","paired-local-runtime","paired-shared-runtime","rich-browser-build","collaboration-build","editor-build",
   "installed-search-workflows","installed-placeholder-workflows","installed-fullscreen-workflows","installed-session-backups","installed-asset-backups",
   "rich-demo-latency","installed-search-browser","installed-placeholder-browser","installed-fullscreen-browser","installed-session-backups-browser","installed-asset-backups-browser",
  ]],
 ]){
  const run=spawnSync(process.execPath,[script,`--${profile}`,"--dry-run"],{cwd:tmpdir(),encoding:"utf8"});
  assert.equal(run.status,0,run.stderr);
  const selected=JSON.parse(run.stdout);
  assert.equal(selected.executed,false);
  assert.equal(selected.profile,profile);
  assert.equal(selected.v1Ready,false);
  assert.deepEqual(selected.deferred,["full-candidate-qualification"]);
  assert.deepEqual(selected.checks,ids.map(id=>full.find(check=>check.id===id)));
 }
 const sharedFixtures=full.find(check=>check.id==="shared-browser-native-fixtures");
 assert.deepEqual(sharedFixtures.args.slice(-4),["--example","relay_contract_driver","--example","compare_engine_exports"]);
 for(const [engine,project] of [["chromium","chromium"],["firefox","firefox"],["webkit","webkit*"]]){
  const rich=full.find(check=>check.id==="rich-browser-"+engine);
  assert.deepEqual(rich.args.slice(-4),["experiments/rich-browser/playwright.config.mjs","--project="+project,"--output=target/rich-browser-results/"+engine,"--reporter=line,json"]);
  assert.deepEqual(rich.artifacts,[{path:rich.env.PLAYWRIGHT_JSON_OUTPUT_FILE,fresh:true,retain:true}]);
 }
 for(const args of [
  ["--functional","--default-matrix"],
  ["--editor-browser-matrix","--activation-evidence","inputs","reports"],
 ]){
  const run=spawnSync(process.execPath,[script,...args,"--dry-run"],{encoding:"utf8"});
  assert.equal(run.status,2);
  assert.equal(run.stdout,"");
 }
});
test("application network evidence counts pilot runs from each Playwright file suite",()=>{
 const titles=[
  "the first-party pilot opens independent participants and verifies an offline checkpoint after reload",
  "the pilot supports keyboard sign-in and checkpoint recovery at a narrow viewport",
 ];
 const report={stats:{expected:6,skipped:0,unexpected:0,flaky:0},suites:
  ["chromium","firefox","webkit-1"].map(projectName=>({file:"network-demo.spec.mjs",
   specs:titles.map(title=>({title,tests:[{projectName,results:[{status:"passed"}]}]})),
  }))};
 validateApplicationNetworkReport(report);
 assert.throws(()=>validateApplicationNetworkReport({...report,suites:report.suites.slice(0,2)}),/offline checkpoint after reload/);
 assert.throws(()=>validateApplicationNetworkReport({...report,suites:[...report.suites,report.suites[0]]}),/offline checkpoint after reload/);
});
test("candidate engineering coverage can be collected before reviewed readiness",()=>{
 const covered=new Set(candidateCheckProfiles
  .filter(profile=>profile!=="full")
  .flatMap(profile=>candidateReleasePlan({profile}).checks.map(check=>check.id)));
 assert.deepEqual(candidateReleasePlan().checks
  .map(check=>check.id)
  .filter(id=>!covered.has(id)),["reviewed-v1-readiness"]);
 const {checks}=candidateReleasePlan({profile:"installed-feature-browser"});
 const producer=checks.findIndex(check=>check.id==="installed-session-backups");
 const browser=checks.findIndex(check=>check.id==="installed-session-backups-browser");
 assert.ok(producer>=0&&producer<browser);
 assert.deepEqual(checks[producer].artifacts.find(report=>
  report.path==="target/session-backups-installed-consumer.json"),
  {path:"target/session-backups-installed-consumer.json",fresh:true,retain:true});
 assert.deepEqual(checks[browser].artifacts,[
  {path:"target/session-backups-installed-browser.json",fresh:true,retain:true},
 ]);
});

test("candidate shards partition the full plan through installed Native generation reconstruction",()=>{
 const full=candidateReleasePlan(),end=full.checks.findIndex(check=>check.id==="installed-generation-native-reconstruction");
 const byId=new Map(full.checks.map(check=>[check.id,check]));
 const covered=[];
 for(const name of candidateShardIds){
  const selected=candidateShardPlan(full,name);
  assert.equal(selected.v1Ready,false);
  assert.deepEqual(selected.deferred,["full-candidate-qualification"]);
  assert.deepEqual(selected.checks,[...selected.shard.prerequisites,...selected.shard.stages].map(id=>byId.get(id)));
  assert.equal(new Set(selected.checks.map(check=>check.id)).size,selected.checks.length);
  if(name!=="native"&&name!=="runtime-packages")assert.ok(selected.shard.prerequisites.includes("paired-shared-runtime"));
  covered.push(...selected.shard.stages);
 }
 assert.deepEqual(covered,full.checks.slice(0,end+1).map(check=>check.id));
 const metadata=candidateShardPlan(full,"metadata-handover");
 assert.deepEqual(metadata.shard.prerequisites.slice(-4),[
  "editor-build","segmented-relay-native-host","segmented-retained-native-host","selected-delivery-native-host",
 ]);
 assert.throws(()=>candidateShardPlan({...full,checks:full.checks.filter(check=>check.id!=="selected-delivery-native-host")},"metadata-handover"),
  /missing a preceding build prerequisite/);
 const joint=candidateShardPlan(full,"joint-handover-source");
 assert.deepEqual(joint.shard.prerequisites.slice(-2),["native-suggestion-room-host","native-handover-activation-host-build"]);
 assert.deepEqual(joint.shard.stages.slice(-2),["joint-handover-cohort-host","joint-handover-native"]);
 for(const name of ["joint-handover-installed","cold-joint-handover-source","cold-joint-handover-installed","sealed-joint-recovery-source","sealed-joint-recovery-installed"]){
  const selected=candidateShardPlan(full,name);
  assert.equal(selected.shard.stages.length,1);
  assert.deepEqual(selected.shard.prerequisites.slice(-3),[...joint.shard.prerequisites.slice(-2),"joint-handover-cohort-host"]);
 }
 for(const name of ["native-suggestion-delivery","native-revision-delivery"]){
  const selected=candidateShardPlan(full,name);
  assert.deepEqual(selected.shard.prerequisites.slice(-2),["metadata-native-hosts","native-suggestion-room-host"]);
  assert.equal(selected.shard.stages.at(-1),"installed-"+name);
 }
 for(const name of ["local-metadata-records","local-metadata-references","local-metadata-availability"]){
  assert.equal(candidateShardPlan(full,name).shard.prerequisites.at(-1),"native-suggestion-room-host");
 }
 for(const name of ["local-metadata-materialization","recoverable-metadata","metadata-server-bytes"]){
  const selected=candidateShardPlan(full,name);
  assert.deepEqual(selected.shard.prerequisites.slice(-2),["selected-delivery-native-host","native-suggestion-room-host"]);
  assert.equal(selected.shard.stages.at(-1),"installed-"+name);
 }
 for(const name of candidateShardIds.slice(candidateShardIds.indexOf("local-metadata-records"))){
  const {checks,shard}=candidateShardPlan(full,name);
  const nativeHost=checks.findIndex(check=>check.id==="native-suggestion-room-host");
  for(const id of shard.stages.filter(id=>metadataFixtureStageIds.includes(id))){
   assert.ok(nativeHost>=0&&nativeHost<checks.findIndex(check=>check.id===id),id);
  }
 }
 const serverMetadataHost="server-metadata-native-host",nativeDependencyHost="server-native-dependencies-host";
 for(const [name,hosts] of [
  ["server-metadata",["metadata-reconciliation-root-host",serverMetadataHost]],
  ["server-native-dependencies",[serverMetadataHost,nativeDependencyHost]],
  ["local-metadata-receipt-containment",[serverMetadataHost]],
  ["local-metadata-packet-recovery",[serverMetadataHost]],
  ["server-packet-recovery",[serverMetadataHost,nativeDependencyHost,"server-packet-inspection-native-host"]],
  ["current-server-packet-reconciliation",[serverMetadataHost,nativeDependencyHost,"server-packet-inspection-native-host"]],
  ["independent-current-reconciliation",[serverMetadataHost,nativeDependencyHost,"server-packet-inspection-native-host"]],
 ]){
  const {checks,shard}=candidateShardPlan(full,name);
  assert.equal(shard.stages.at(-1),"installed-"+name);
  for(const host of hosts){
   const build=checks.findIndex(check=>check.id===host);
   assert.ok(build>=0&&build<checks.length-1,host);
  }
 }

 assert.throws(()=>candidateShardPlan({...full,checks:full.checks.filter(check=>check.id!=="collaboration-build")},"local-history"),/diverged/);
 assert.throws(()=>candidateShardPlan({...full,checks:full.checks.filter(check=>check.id!=="paired-shared-runtime")},"local-history"),/missing a preceding build prerequisite/);
 const script=join(repository,"scripts/verify-candidate.mjs");
 const run=spawnSync(process.execPath,[script,"--shard","restored-history","--dry-run"],{encoding:"utf8",cwd:tmpdir()});
 assert.equal(run.status,0,run.stderr);
 assert.deepEqual(JSON.parse(run.stdout).shard,candidateShardPlan(full,"restored-history").shard);
 for(const args of [["--shard","all"],["--shard","native","--functional"],["--shard","native","--shard","native"]]){
  const rejected=spawnSync(process.execPath,[script,...args,"--dry-run"],{encoding:"utf8"});
  assert.equal(rejected.status,2);
 }
});
test("nested default and candidate builds receive the same selected toolchain without a PATH requirement",()=>{
 const environment={BREDITOR_CARGO:"/tools with spaces/cargo",BREDITOR_RUSTC:"/tools with spaces/rustc",BREDITOR_WASM_BINDGEN:"/tools with spaces/bindgen",WASM_BINDGEN_TEST_RUNNER_BIN:"/tools with spaces/runner",BREDITOR_NPM:"/tools with spaces/npm"};
 for(const c of candidateReleasePlan({environment}).checks){assert.equal(c.env.CARGO_BIN,environment.BREDITOR_CARGO);assert.equal(c.env.BREDITOR_CARGO,environment.BREDITOR_CARGO);assert.equal(c.env.RUSTC,environment.BREDITOR_RUSTC);assert.equal(c.env.RUSTC_BIN,environment.BREDITOR_RUSTC);assert.equal(c.env.BREDITOR_RUSTC,environment.BREDITOR_RUSTC);assert.equal(c.env.WASM_BINDGEN_BIN,environment.BREDITOR_WASM_BINDGEN);assert.equal(c.env.BREDITOR_WASM_BINDGEN,environment.BREDITOR_WASM_BINDGEN);assert.equal(c.env.WASM_BINDGEN_TEST_RUNNER_BIN,environment.WASM_BINDGEN_TEST_RUNNER_BIN);assert.equal(c.env.NPM_BIN,environment.BREDITOR_NPM);assert.equal(c.env.NODE_BIN,process.execPath);}
 const old=candidateReleasePlan({environment:{CARGO_BIN:"/legacy/cargo",RUSTC_BIN:"/legacy/rustc",WASM_BINDGEN_BIN:"/legacy/bindgen",NPM_BIN:"/legacy/npm"}});assert.equal(old.checks[0].env.CARGO_BIN,"/legacy/cargo");assert.equal(old.checks[0].env.BREDITOR_RUSTC,"/legacy/rustc");assert.equal(old.checks[0].env.BREDITOR_WASM_BINDGEN,"/legacy/bindgen");assert.equal(old.checks.find(c=>c.id==="default-typescript-build").command,"/legacy/npm");
});
test("source identity includes dirty/untracked inputs but ignores generated cache bytes",()=>{
 const root=temporary();try{
  execFileSync("git",["init","--quiet"],{cwd:root});writeFileSync(join(root,".gitignore"),"cache/\n");writeFileSync(join(root,"input.rs"),"original source");execFileSync("git",["add","--",".gitignore","input.rs"],{cwd:root});execFileSync("git",["-c","user.name=Fixture","-c","user.email=fixture@example.invalid","commit","--quiet","-m","Fixture"],{cwd:root});
  const first=sourceEvidence(root);assert.equal(first.dirty,false);assert.equal(first.files,2);
  mkdirSync(join(root,"cache"));writeFileSync(join(root,"cache/generated.bin"),"ignored cache bytes");assert.equal(sourceEvidence(root).sha256,first.sha256);assert.equal(sourceEvidence(root).dirty,false);
  writeFileSync(join(root,"extra.ts"),"untracked candidate");const extra=sourceEvidence(root);assert.equal(extra.dirty,true);assert.equal(extra.files,3);assert.notEqual(extra.sha256,first.sha256);
  const before=extra.sha256;utimesSync(join(root,"input.rs"),new Date(),new Date());assert.equal(sourceEvidence(root).sha256,before,"Timestamps are not source content");
  writeFileSync(join(root,"input.rs"),"modified source");assert.notEqual(sourceEvidence(root).sha256,before);
  symlinkSync(join(root,"input.rs"),join(root,"unsupported-link.rs"));assert.throws(()=>sourceEvidence(root),/Unsupported/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("artifact evidence refuses traversal, directories and escaping symbolic links",()=>{
 const root=temporary(),outside=temporary();try{writeFileSync(join(root,"result.json"),"proof");writeFileSync(join(outside,"secret"),"outside");assert.equal(fileEvidence(root,"result.json").bytes,5);assert.throws(()=>fileEvidence(root,"../secret"));assert.throws(()=>fileEvidence(root,"."));symlinkSync(join(outside,"secret"),join(root,"outside"));assert.throws(()=>fileEvidence(root,"outside"),/escapes/);}finally{rmSync(root,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});}
});
test("atomic evidence replaces only the fresh owned manifest and leaves no intermediate file",()=>{
 const root=temporary();try{const path=join(root,"result.json");saveEvidence(path,{status:"running"});saveEvidence(path,{status:"failed"});assert.deepEqual(JSON.parse(readFileSync(path,"utf8")),{status:"failed"});assert.equal(existsSync(`${path}.next`),false);assert.equal(statSync(path).mode&0o777,0o600);}finally{rmSync(root,{recursive:true,force:true});}
});
test("real child output is retained with its exact exit status, including launch failure",async()=>{
 const root=temporary();try{
  const success=await executeCandidateStage(fixtureCheck(),{root,logPath:join(root,"ok.log")});assert.equal(success.status,"passed");assert.equal(success.exitCode,0);assert.match(readFileSync(join(root,"ok.log"),"utf8"),/fixture proof/);
  const failed=await executeCandidateStage(fixtureCheck("failed","console.error('retained failure');process.exitCode=7"),{root,logPath:join(root,"bad.log")});assert.equal(failed.status,"failed");assert.equal(failed.exitCode,7);assert.match(readFileSync(join(root,"bad.log"),"utf8"),/retained failure/);
  const long=await executeCandidateStage(fixtureCheck("long-failed","console.log('x'.repeat(20000));console.error('EXACT-FAILED-TEST-TAIL');process.exitCode=7"),{root,logPath:join(root,"long-failed.log")});assert.equal(long.status,"failed");assert.equal(long.exitCode,7);assert.ok(long.logBytes>20000);assert.match(readFileSync(join(root,"long-failed.log"),"utf8"),/EXACT-FAILED-TEST-TAIL/);
  const absent=await executeCandidateStage({...fixtureCheck(),command:join(root,"absent-executable")},{root,logPath:join(root,"absent.log")});assert.equal(absent.status,"launch-failed");assert.match(absent.error,/ENOENT/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("timeouts, aborted execution and log exhaustion cannot pass",async()=>{
 const root=temporary();try{
  const timeout=await executeCandidateStage({...fixtureCheck("timeout","setInterval(()=>{},1000)"),timeoutMs:80},{root,logPath:join(root,"timeout.log")});assert.equal(timeout.status,"timeout");
  const limit=await executeCandidateStage(fixtureCheck("limit","console.log('x'.repeat(1000))"),{root,logPath:join(root,"limit.log"),logLimit:64});assert.equal(limit.status,"log-limit");assert.equal(statSync(join(root,"limit.log")).size,64);
  const controller=new AbortController();controller.abort();const aborted=await executeCandidateStage(fixtureCheck("aborted","throw Error('must not launch')"),{root,logPath:join(root,"aborted.log"),signal:controller.signal});assert.equal(aborted.status,"interrupted");assert.equal(aborted.logBytes,0);
  const running=new AbortController(),timer=setTimeout(()=>running.abort(),80);try{const stopped=await executeCandidateStage(fixtureCheck("cancel-running","setInterval(()=>{},1000)"),{root,logPath:join(root,"cancel.log"),signal:running.signal});assert.equal(stopped.status,"interrupted");}finally{clearTimeout(timer);}
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("a completed functional run still records no V1 or publication approval",async()=>{
 const root=temporary();try{const run=await runCandidateChecks(plan([fixtureCheck()]),quiet({root}));assert.equal(run.exitCode,0);assert.equal(run.result.selectedChecksPassed,true);assert.equal(run.result.v1Ready,false);assert.equal(run.result.publicationApproved,false);assert.equal(run.result.stages[0].log.bytes,14);assert.equal(JSON.parse(readFileSync(run.manifest,"utf8")).status,"passed");}finally{rmSync(root,{recursive:true,force:true});}
});
test("first failed stage retains evidence and does not run later stages",async()=>{
 const root=temporary();try{const run=await runCandidateChecks(plan([fixtureCheck("first","process.exitCode=7"),fixtureCheck("never")]),quiet({root}));assert.equal(run.exitCode,1);assert.equal(run.result.stages.length,1);assert.equal(run.result.status,"failed");assert.equal(run.result.stages[0].exitCode,7);assert.ok(existsSync(run.result.stages[0].logPath));}finally{rmSync(root,{recursive:true,force:true});}
});
test("source inventory refusal is retained before any child launches",async()=>{
 const root=temporary();let launched=false;try{
  const run=await runCandidateChecks(plan([fixtureCheck()]),quiet({root,snapshot:()=>{throw Error("Unsupported source inventory");},execute:async()=>{launched=true;throw Error("must not launch");}}));
  assert.equal(launched,false);assert.equal(run.exitCode,1);assert.equal(run.result.source,null);assert.equal(run.result.stages.length,0);assert.match(run.result.error,/Unsupported source inventory/);assert.deepEqual(JSON.parse(readFileSync(run.manifest,"utf8")),run.result);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("a running stage retains its start time before the child completes",async()=>{
 const root=temporary();try{const run=await runCandidateChecks(plan([fixtureCheck()]),quiet({root,execute:async(check,options)=>{const manifest=JSON.parse(readFileSync(join(options.root,"target/v1-candidate-runs",(await import("node:fs")).readdirSync(join(options.root,"target/v1-candidate-runs"))[0],"result.json"),"utf8"));assert.equal(manifest.stages[0].status,"running");assert.ok(Number.isFinite(Date.parse(manifest.stages[0].startedAt)));return executeCandidateStage(check,options);}}));assert.equal(run.exitCode,0);}finally{rmSync(root,{recursive:true,force:true});}
});
test("missing/stale declared artifacts reject a zero-exit stage",async()=>{
 for(const stale of [false,true]){const root=temporary();try{if(stale){writeFileSync(join(root,"proof.json"),"old");utimesSync(join(root,"proof.json"),new Date(0),new Date(0));}const check={...fixtureCheck(),artifacts:[{path:"proof.json",fresh:true}]},run=await runCandidateChecks(plan([check]),quiet({root}));assert.equal(run.exitCode,1);assert.equal(run.result.stages[0].status,"failed");if(stale)assert.match(run.result.error,/Stale stage report/);}finally{rmSync(root,{recursive:true,force:true});}}
});
test("a source edit during a stage invalidates its pass before later checks",async()=>{
 const root=temporary();let changed=false;try{const run=await runCandidateChecks(plan([fixtureCheck("first"),fixtureCheck("never")]),quiet({root,snapshot:()=>({...stable(),sha256:changed?"changed":"original"}),execute:async(check,options)=>{const result=await executeCandidateStage(check,options);changed=true;return result;}}));assert.equal(run.exitCode,1);assert.equal(run.result.stages.length,1);assert.equal(run.result.stages[0].status,"failed");assert.equal(run.result.stages[0].log.sha256,fileEvidence(root,run.result.stages[0].log.path).sha256,"Source changes cannot discard the completed stage log hash");assert.match(run.result.error,/Source changed/);}finally{rmSync(root,{recursive:true,force:true});}
});
test("a chmod-only edit invalidates candidate evidence when Git ignores file modes",{skip:process.platform==="win32"},async()=>{
 const root=temporary(),path=join(root,"tool.sh");
 try{
  execFileSync("git",["init","-q"],{cwd:root});
  execFileSync("git",["config","core.fileMode","false"],{cwd:root});
  writeFileSync(path,"#!/bin/sh\nexit 0\n");
  execFileSync("git",["add","tool.sh"],{cwd:root});
  execFileSync("git",["-c","user.name=Fixture","-c","user.email=fixture@example.invalid","commit","-qm","fixture"],{cwd:root});
  writeFileSync(join(root,".git","info","exclude"),"/target/\n");
  const before=sourceEvidence(root);
  const run=await runCandidateChecks(plan([
   fixtureCheck("mode-change","require('node:fs').chmodSync('tool.sh',0o755)"),
   fixtureCheck("never"),
  ]),quiet({root,snapshot:sourceEvidence}));
  assert.equal(sourceEvidence(root).dirty,false);
  assert.notEqual(sourceEvidence(root).sha256,before.sha256);
  assert.equal(run.exitCode,1);
  assert.equal(run.result.stages.length,1);
  assert.match(run.result.error,/Source changed/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("empty, repeated or path-bearing check IDs cannot manufacture a successful run",async()=>{
 const root=temporary();try{for(const checks of [[],[fixtureCheck("same"),fixtureCheck("same")],[fixtureCheck("../outside")]])await assert.rejects(runCandidateChecks(plan(checks),quiet({root})),/Invalid candidate check plan/);}finally{rmSync(root,{recursive:true,force:true});}
});
test("workspace exposes the separate candidate verifier without changing the default verifier",()=>{
 const {scripts}=JSON.parse(readFileSync(join(repository,"package.json"),"utf8"));assert.equal(scripts["verify:release"],"node scripts/verify-release.mjs");assert.equal(scripts["verify:candidate"],"node scripts/verify-candidate.mjs");assert.equal(scripts["verify:candidate:functional"],"node scripts/verify-candidate.mjs --functional");
});
test("both profiles require durable participant attempts and all explicit native session families",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile}),find=id=>{const r=plan.checks.find(s=>s.id===id);assert.ok(r,id);return r;};assert.deepEqual(find("participant-recovery-storage-contracts").args,["--test","scripts/participant-recovery-storage.test.mjs"]);assert.deepEqual(find("participant-recovery-type-fence").args,["node_modules/typescript/bin/tsc","--noEmit","--strict","--exactOptionalPropertyTypes","--target","ES2022","--module","NodeNext","--lib","ES2022,DOM","scripts/fixtures/editor-consumer/types-participant-recovery.ts"]);for(const [id,file]of [["participant-recovery","probe-participant-recovery.mjs"],["document-participant-recovery","probe-document-participant-recovery.mjs"]]){assert.deepEqual(find(id).args,[`scripts/${file}`,"target/promoted-shared-web"]);assert.ok(plan.checks.indexOf(find(id))>plan.checks.indexOf(find("collaboration-build")));}}
});
test("both profiles require exact native inventory, real SDK recovery and public immutable non-authority types",()=>{
 for(const profile of ["functional","full"]){
  const p=candidateReleasePlan({profile}),find=id=>{const row=p.checks.find(s=>s.id===id);assert.ok(row,id);return row;};
  assert.deepEqual(find("room-participant-inventory-contracts").args,["--test","scripts/room-participant-inventory.test.mjs"]);
  assert.deepEqual(find("room-participant-inventory-type-fence").args,["node_modules/typescript/bin/tsc","--noEmit","--strict","--exactOptionalPropertyTypes","--target","ES2022","--module","NodeNext","--lib","ES2022,DOM","scripts/fixtures/editor-consumer/types-room-participant-inventory.ts"]);
  for(const [id,script,path]of [["native-room-participant-inventory","check-room-participant-inventory-native.mjs","target/room-participant-inventory-native.json"],["room-participant-inventory","check-room-participant-inventory-sdk.mjs","target/room-participant-inventory-sdk.json"]]){const row=find(id);assert.deepEqual(row.args,[`scripts/${script}`]);assert.deepEqual(row.artifacts,[{path,fresh:true}]);assert.ok(p.checks.indexOf(row)>p.checks.indexOf(find("collaboration-build")));}
  assert.ok(p.checks.indexOf(find("native-room-participant-inventory"))<p.checks.indexOf(find("room-participant-inventory")));assert.deepEqual(find("installed-session-backups").args,["scripts/check-session-backups-installed.mjs"]);
 }
});
test("fresh installed backup acceptance retains old assertions and adds bare native inventory and production imports",()=>{
 const text=readFileSync(join(repository,"scripts/check-session-backups-installed.mjs"),"utf8");
 for(const required of ["types-room-participant-inventory.ts","buildRoomParticipantInventoryFixtures({saveReport:false})","room-participant-inventory-probe.mjs","room-participant-inventory.html","/node_modules/@breditor/collaboration/dist/room_participant_inventory/","acceptance.cases,20","retainedStores.storeRestores,90","participantBackups","participantRecovery","documentParticipantRecovery","registeredStreamsCovered:40","documentForkRefusals:10","reviewForkRefusals:10","futureDocumentCheckpoints:36","networkCalls:0"])assert.ok(text.includes(required),required);
 assert.ok(!text.includes('args.includes("--skip')&&!text.includes("--skip-inventory"));
});
test("both profiles require exact initial policy through native fixtures, public types and installed owners",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>p.checks.find(row=>row.id===id),row=find("initial-read-only-recovery");assert.ok(row);assert.deepEqual(row.args,["scripts/check-initial-read-only-sdk.mjs"]);assert.deepEqual(row.artifacts,[{path:"target/initial-read-only-sdk.json",fresh:true}]);assert.ok(p.checks.indexOf(find("native-room-participant-inventory"))<p.checks.indexOf(row));assert.deepEqual(find("initial-read-only-type-fence").args,["node_modules/typescript/bin/tsc","--noEmit","--strict","--exactOptionalPropertyTypes","--target","ES2022","--module","NodeNext","--lib","ES2022,DOM","scripts/fixtures/editor-consumer/types-initial-read-only.ts"]);}
 const installed=readFileSync(join(repository,"scripts/check-session-backups-installed.mjs"),"utf8");for(const required of ["types-initial-read-only.ts","initial-read-only-probe.mjs","initialReadOnly","families:108","protectedReopens:20","initial-read-only.html","/node_modules/@breditor/collaboration/dist/initialize_read_only.js"])assert.ok(installed.includes(required),required);
});
test("both profiles require durable room catalogs with original native re-admission and retained copies",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>p.checks.find(row=>row.id===id),row=find("room-recovery-catalog");assert.ok(row);assert.deepEqual(row.args,["scripts/check-room-recovery-catalog-sdk.mjs"]);assert.deepEqual(row.artifacts,[{path:"target/room-recovery-catalog-sdk.json",fresh:true}]);assert.ok(p.checks.indexOf(find("native-room-participant-inventory"))<p.checks.indexOf(row));assert.deepEqual(find("room-recovery-catalog-contracts").args,["--test","scripts/room-recovery-catalog-storage.test.mjs"]);assert.ok(find("room-recovery-catalog-type-fence").args.includes("scripts/fixtures/editor-consumer/types-room-recovery-catalog.ts"));}
 const installed=readFileSync(join(repository,"scripts/check-session-backups-installed.mjs"),"utf8");for(const required of ["types-room-recovery-catalog.ts","room-recovery-catalog-probe.mjs","roomRecoveryCatalog","pendingRetainedCopies:10","lostAcknowledgementResumes:3","fabricatedCompletionRefusals:1","room-recovery-catalog.html","/node_modules/@breditor/collaboration/dist/room_recovery_catalog/"])assert.ok(installed.includes(required),required);
});
test("both profiles require native recovery-origin continuity and pre-autosave storage admission",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const row=p.checks.find(s=>s.id===id);assert.ok(row,id);return row;};assert.deepEqual(find("participant-origin-storage-contracts").args,["--test","scripts/participant-origin-storage.test.mjs"]);assert.ok(find("participant-origin-type-fence").args.includes("scripts/fixtures/editor-consumer/types-recovery-origin.ts"));assert.deepEqual(find("participant-native-origin").args,["scripts/probe-participant-origin.mjs","target/promoted-shared-web"]);assert.ok(p.checks.indexOf(find("participant-native-origin"))>p.checks.indexOf(find("collaboration-build")));}
});
test("both profiles require operational custody, all original native families and fresh installed consumers",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const row=p.checks.find(s=>s.id===id);assert.ok(row,id);return row;};assert.deepEqual(find("participant-operation-storage-contracts").args,["--test","scripts/participant-operation-storage.test.mjs"]);assert.ok(find("participant-operation-type-fence").args.includes("scripts/fixtures/editor-consumer/types-participant-operation.ts"));assert.deepEqual(find("participant-operation").args,["scripts/probe-participant-operation.mjs","target/promoted-shared-web"]);assert.ok(p.checks.indexOf(find("participant-operation"))>p.checks.indexOf(find("collaboration-build")));}
 const installed=readFileSync(join(repository,"scripts/check-session-backups-installed.mjs"),"utf8");for(const required of ["participant-operation-probe.mjs","types-participant-operation.ts","participant-operation-bundle.mjs","custodyTransfers:66","coldReopens:198","nativeForkRefusals:1","/participant_operation/operation.js"])assert.ok(installed.includes(required),required);
});
test("both profiles require real catalog-staged factory composition and installed native checks",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const row=p.checks.find(s=>s.id===id);assert.ok(row,id);return row;};assert.deepEqual(find("catalog-native-factory-contracts").args,["--test","scripts/catalog-native-factory.test.mjs"]);assert.deepEqual(find("catalog-participant-operation").args,["scripts/check-catalog-participant-operation-sdk.mjs"]);assert.deepEqual(find("catalog-participant-operation").artifacts,[{path:"target/catalog-participant-operation-sdk.json",fresh:true}]);assert.ok(find("installed-session-backups").artifacts.some(row=>row.path==="target/catalog-participant-operation-installed-consumer.json"&&row.fresh));}
 const installed=readFileSync(join(repository,"scripts/check-session-backups-installed.mjs"),"utf8");for(const required of ["catalog-participant-operation-probe.mjs","receiverChecks:true","protectedWriteRefusals:11","retainedRedo:9","catalogOperationReport","catalog-participant-operation-installed-consumer.json"])assert.ok(installed.includes(required),required);
 const checker=readFileSync(join(repository,"scripts/check-catalog-participant-operation-sdk.mjs"),"utf8");assert.ok(checker.includes("buildRoomParticipantInventoryFixtures({saveReport:false})"));assert.ok(checker.includes("acceptance.receiverChecks,true"));
});
test("both profiles require genuine parent operational attempts, explicit current policy and fresh installed proof",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const row=p.checks.find(s=>s.id===id);assert.ok(row,id);return row;};assert.deepEqual(find("room-operation-storage-contracts").args,["--test","scripts/room-operation-storage.test.mjs"]);assert.ok(find("room-operation-type-fence").args.includes("scripts/fixtures/editor-consumer/types-room-operation.ts"));assert.deepEqual(find("room-operational-recovery").args,["scripts/check-room-operational-recovery-sdk.mjs"]);assert.deepEqual(find("room-operational-recovery").artifacts,[{path:"target/room-operational-recovery-sdk.json",fresh:true}]);assert.ok(find("installed-session-backups").artifacts.some(row=>row.path==="target/room-operational-recovery-installed-consumer.json"&&row.fresh));}
 const installed=readFileSync(join(repository,"scripts/check-session-backups-installed.mjs"),"utf8");for(const required of ["types-room-operation.ts","room-operational-recovery-probe.mjs","room-operation-bundle.mjs","parentColdReopens:30","sourceCloseBeforeCustodyCommit:1","newPendingVersions:9","newPendingProposals:4","roomOperationReport"])assert.ok(installed.includes(required),required);
});

test('both profiles require genuine mixed V2 parent custody, atomic guards and fresh installed assertions',()=>{
 for(const profile of ['functional','full']){
  const p=candidateReleasePlan({profile}),find=id=>{const row=p.checks.find(row=>row.id===id);assert.ok(row,id);return row;};
  for(const[id,file]of [['internal-failure-cause-contracts','internal-failure-cause.test.mjs'],['ready-preparation-retarget-contracts','ready-retarget-lifetime.test.mjs'],['room-operation-v2-storage-contracts','room-operation-v2-storage.test.mjs']])assert.deepEqual(find(id).args,['--test','scripts/'+file]);
  assert.ok(find('room-operation-v2-type-fence').args.includes('scripts/fixtures/editor-consumer/types-room-operation-v2.ts'));
  for(const[id,file,artifact]of [['room-operational-recovery-v2','check-room-operational-recovery-v2-sdk.mjs','target/room-operational-recovery-v2-sdk.json'],['installed-room-operational-recovery-v2','check-room-operational-recovery-v2-installed.mjs','target/room-operational-recovery-v2-installed-consumer.json']]){const row=find(id);assert.deepEqual(row.args,['scripts/'+file]);assert.deepEqual(row.artifacts,[{path:artifact,fresh:true}]);assert.ok(p.checks.indexOf(row)>p.checks.indexOf(find('native-room-participant-inventory')));}
 }
 const installed=readFileSync(join(repository,'scripts/check-room-operational-recovery-v2-installed.mjs'),'utf8');for(const value of ['room-operation-v2/faults.mjs','room-operation-v2/original-source-reservation.mjs','room-operation-v2/prepared-policy.mjs','room-operation-v2/operation-opening.mjs','room-operation-v2/operation-resume-opening.mjs','room-operation-v2/operation-held-retry.mjs','room-operation-v2/retargets.mjs','executeCandidateStage','saveEvidence(childReport','checkRoomOperationV2Acceptance','strictPublicTypes:true','noWorkspaceReactOrSyntheticStorageInProduction:true'])assert.ok(installed.includes(value),value);
 const acceptance=readFileSync(join(repository,'scripts/fixtures/room-operation-v2/acceptance.mjs'),'utf8');for(const value of ['participantRecordComparisons:180','wholeUploadComparisons:180','coldResumedParticipants:60','databaseCloseRefusals:6','atomicGuardRefusals:12','originalSourceReentrancyRefusals:6','preparedCurrentPolicyParticipants:12','preparedPolicyReleaseRetries:12','operationOpeningCleanupRetries:12','operationalResumeOpeningRetries:24','heldReadyOperationRetries:12'])assert.ok(acceptance.includes(value),value);
 assert.ok(readFileSync(join(repository,'scripts/probe-room-operational-recovery.mjs'),'utf8').includes('roomFailureDiagnostic'));assert.ok(readFileSync(join(repository,'scripts/fixtures/room-operation/managed-handoffs.mjs'),'utf8').includes('internalFailureChain'));
});

test("selected audit reports retain exact bytes with the stage log",async()=>{
 const root=temporary();
 try{
  const selected=fixtureCheck("audit",
   "const fs=require('node:fs'); fs.writeFileSync('target/audit.json', '{}\\n'); fs.writeFileSync('target/local-only.json', 'local')");
  selected.artifacts=[{path:"target/audit.json",fresh:true,retain:true},{path:"target/local-only.json"}];
  const {result,manifest}=await runCandidateChecks(plan([selected]),quiet({root}));
  assert.equal(result.status,"passed");
  const [audit,local]=result.stages[0].artifacts;
  assert.equal(audit.retainedPath,"artifacts/audit/target/audit.json");
  assert.equal(local.retainedPath,undefined);
  const retained=fileEvidence(join(manifest,".."),audit.retainedPath);
  assert.deepEqual([retained.sha256,retained.bytes],[audit.sha256,audit.bytes]);
  assert.equal(readFileSync(join(manifest,"..",audit.retainedPath),"utf8"),"{}\n");
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("the candidate retains the exact installed editor, interchange and mixed workflow reports",()=>{
 const editorReport=[{path:"target/editor-installed-consumer.json",fresh:true,retain:true}];
 for(const profile of ["functional","full"]){
  const {checks}=candidateReleasePlan({profile});
  assert.deepEqual(checks.find(check=>check.id==="installed-editor-pairing")?.artifacts,
   editorReport);
 }
 for(const profile of ["functional","full","installed-distribution-workflows"]){
  const {checks}=candidateReleasePlan({profile});
  assert.deepEqual(checks.find(check=>check.id==="installed-rich-interchange")?.artifacts,
   [{path:"target/interchange-installed-consumer.json",fresh:true,retain:true}]);
  assert.deepEqual(checks.find(check=>check.id==="installed-everyday-mixed-workflows")?.artifacts,
   [{path:"target/editor-mixed-workflows.json",fresh:true,retain:true}]);
 }
 assert.deepEqual(candidateReleasePlan().checks.find(check=>check.id==="installed-editor-browser-matrix")?.artifacts,editorReport);
});

test("candidate runner prints the stage ID and a single-line evidence failure",async()=>{
 const root=temporary(),messages=[];
 try{
  const check={...fixtureCheck("missing-proof"),artifacts:[{path:"missing.json",fresh:true}]};
  const run=await runCandidateChecks(plan([check]),quiet({root,report:message=>messages.push(message)}));
  assert.equal(run.exitCode,1);
  assert.match(messages.find(message=>message.startsWith("verify-candidate: missing-proof: ")),/ENOENT.*missing\.json/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
