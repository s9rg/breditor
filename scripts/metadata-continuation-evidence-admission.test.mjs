import {withHeldAbsentMetadataContinuation} from '../packages/breditor-collaboration/dist/selected_local_metadata_continuation/held_absence.js';
/** A copied origin must not reflect a destination or touch browser storage. */
import test from 'node:test';import assert from 'node:assert/strict';
import {withHeldMetadataContinuationEvidence,withHeldHandoverMetadataContinuationEvidence} from '../packages/breditor-collaboration/dist/selected_local_metadata_continuation/held_evidence.js';
test('continuation evidence rejects foreign origin before reading destination DATA or storage',async()=>{
 let reflected=0;const poison=new Proxy({},{get(){reflected++;throw Error('Unexpected reflection');},ownKeys(){reflected++;throw Error('Unexpected reflection');}});
 for(const scope of [{},poison])for(const origin of [{},poison])for(const action of [withHeldMetadataContinuationEvidence,withHeldHandoverMetadataContinuationEvidence,withHeldAbsentMetadataContinuation])await assert.rejects(action(scope,origin,poison,()=>{throw Error('No visitor');}),error=>error.code==='metadata_continuation_closed');
 assert.equal(reflected,0);
});
