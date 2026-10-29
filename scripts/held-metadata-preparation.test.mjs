import test from 'node:test';import assert from 'node:assert/strict';
import {families,heldMetadataSession} from './fixtures/held-metadata/session.mjs';
import {prepareCompoundMetadata} from '../packages/breditor-collaboration/dist/metadata/compound_preparation.js';
const excluded=e=>['native_recovery_busy','version_recovery_in_use','suggestion_recovery_in_use','metadata_preparation_policy'].includes(e?.code);
for(const family of families)for(const scope of [0,1,2])for(const mask of [0,1,2,3])test(family.name+' / scope '+scope+' / policy '+mask+': reopen exact pending atomic children without writing, networking or ordinary mutation authority',{timeout:120000},async()=>heldMetadataSession({family,scope,mask},async f=>{
 const native=f.recovery();f.arm();f.shadow();await assert.rejects(prepareCompoundMetadata({...f.source},f.context));await assert.rejects(prepareCompoundMetadata(f.source,{...f.context}));
 const parts=await f.prepare();assert.ok(parts.versions);assert.ok(parts.suggestions);assert.ok(parts.revisions);assert.deepEqual(parts.versions.exportRecovery(),f.before.retained.versions);assert.deepEqual(parts.suggestions.exportRecovery(),f.before.retained.suggestions);assert.deepEqual(parts.revisions.exportRecovery(),f.before.retained.revisions);assert.deepEqual(f.recovery(),native);assert.equal(f.writes,0);assert.equal(f.network,0);
 assert.throws(()=>parts.versions.saveVersion('Forbidden','7'),excluded);assert.throws(()=>parts.suggestions.queueDecision('0'.repeat(64),'accept','8'),excluded);assert.throws(()=>parts.revisions.stopRetrying('0'.repeat(64)),excluded);assert.throws(()=>f.source.core.select(null),excluded);
 const again=await f.prepare();assert.equal(again.versions,parts.versions);assert.equal(again.suggestions,parts.suggestions);assert.equal(again.revisions,parts.revisions);assert.equal(f.writes,0);f.evidence();
 const cold=await f.coldAgain();assert.deepEqual(cold.versions.exportRecovery(),f.before.retained.versions);assert.deepEqual(cold.suggestions.exportRecovery(),f.before.retained.suggestions);assert.deepEqual(cold.revisions.exportRecovery(),f.before.retained.revisions);await f.finish();
}));
