/** Prefix evidence must use canonical native, source and actual public archives. */
import assert from 'node:assert/strict';import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+' requires native author-prefix integrity before later room reads',()=>{
 const plan=candidateReleasePlan({profile}),ids=plan.checks.map(row=>row.id);
 for(const id of ['shared-native','writer-prefix-native','writer-prefix-plan-contracts','paired-shared-runtime','collaboration-build','writer-prefix-type-fence','writer-prefix-sdk','installed-writer-prefix'])assert.equal(ids.filter(value=>value===id).length,1,id);
 const native=plan.checks.find(row=>row.id==='writer-prefix-native');assert.deepEqual(native.args.slice(-2),['--test','writer_clock_at']);
 for(const flag of ['--locked','--offline','--release'])assert.ok(native.args.includes(flag));assert.ok(native.env.CARGO_TARGET_DIR.endsWith('/target/historical-source-native'));
 for(const [id,file,artifact]of [['writer-prefix-sdk','check-writer-prefix-sdk.mjs','target/writer-prefix-sdk.json'],['installed-writer-prefix','check-writer-prefix-installed.mjs','target/writer-prefix-installed-consumer.json']]){
  const row=plan.checks.find(value=>value.id===id);assert.deepEqual(row.args,['scripts/'+file]);assert.deepEqual(row.artifacts,[{path:artifact,fresh:true}]);assert.ok(ids.indexOf('paired-shared-runtime')<ids.indexOf(id));assert.ok(ids.indexOf('collaboration-build')<ids.indexOf(id));
 }
 const types=plan.checks.find(row=>row.id==='writer-prefix-type-fence');for(const flag of ['--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess'])assert.ok(types.args.includes(flag));assert.equal(types.args.at(-1),'scripts/fixtures/editor-consumer/types-writer-prefix.ts');assert.equal(plan.v1Ready,false);
});
