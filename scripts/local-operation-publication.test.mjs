/** Existing legacy parent publication laws, independent of the new cohort API. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as Parent} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname;
let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant:Parent,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});
after(()=>host?.free());
test('an unreturned legacy parent cannot read its source during construction',async()=>{
 const f=await host.fixture(),freeze=Object.freeze;let hits=0;
 try{const ready=await f.recover();Object.freeze=function(value){if(value instanceof Parent){hits++;assert.throws(()=>value.readableSource(),e=>e.code==='independent_local_participant_closed');}return freeze(value);};const p=await f.begin(ready);Object.freeze=freeze;assert.equal(hits,1);await p.check();}
 finally{Object.freeze=freeze;await f.close();}
});
test('a legacy constructor ending its grant refuses publication and leaves a cold resumable parent',async()=>{
 const f=await host.fixture(),freeze=Object.freeze;let hits=0;
 try{const ready=await f.recover();Object.freeze=function(value){if(value instanceof Parent){hits++;f.setAllowed(false);}return freeze(value);};await assert.rejects(f.begin(ready),e=>e.code==='participant_authority');Object.freeze=freeze;f.setAllowed(true);assert.equal(hits,1);const p=await f.resume();await p.check();}
 finally{Object.freeze=freeze;f.setAllowed(true);await f.close();}
});
