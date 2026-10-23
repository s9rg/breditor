/** Closed array shape before any genuine parent is reserved or policy runs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {handoffNativeInputParticipants} from '../packages/breditor-collaboration/dist/native_input_operation/cohort.js';
test('caller map overrides cannot erase a supplied fake member into a successful empty cohort',async()=>{
 const rows=[{id:'fake',family:'local-operation-snapshot',operation:{ready:true}}];
 rows.map=()=>[];
 await assert.rejects(handoffNativeInputParticipants(rows),error=>error.code==='restored_local_participant_policy');
});
test('sparse caller arrays refuse with the closed cohort policy failure',async()=>{
 await assert.rejects(handoffNativeInputParticipants(new Array(1)),error=>error.code==='native_input_cohort_policy');
});
