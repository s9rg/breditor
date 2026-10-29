import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {SelectedNativeDeliveryJournal as Journal} from '../packages/breditor-collaboration/dist/selected_delivery_journal/coordinator.js';
import {previewSelectedNativeDeliveryJournalResume as preview} from '../packages/breditor-collaboration/dist/selected_delivery_journal/resume_preview.js';
import {resumePreparedSelectedNativeDelivery} from '../packages/breditor-collaboration/dist/selected_delivery_preparation/coordinator.js';
import {consumeDeliveryResumeAdmission} from '../packages/breditor-collaboration/dist/selected_delivery_journal/resume_admission.js';
test('copied/decoded scope refuses before reflecting resume or preview inputs',async()=>{
 let reflected=0;const input=new Proxy({},{ownKeys(){reflected++;throw Error('Do not inspect caller data without a genuine retained scope');}});
 await assert.rejects(Journal.resume({},input));await assert.rejects(preview({},input));assert.equal(reflected,0);
});
test('copied token cannot create a new delivery gate',async()=>{
 const saved=Object.freeze({format:'breditor/selected-native-delivery-journal-resume',formatVersion:1,approved:true});
 assert.throws(()=>consumeDeliveryResumeAdmission(saved,{}),e=>e.code==='delivery_journal_policy');
 await assert.rejects(resumePreparedSelectedNativeDelivery({},saved),e=>e.code==='delivery_journal_policy');
});
test('preview, one-shot admission and gate internals are not public root grants',()=>{
 for(const name of ['SelectedNativeDeliveryJournal','previewSelectedNativeDeliveryJournalResume','consumeDeliveryResumeAdmission','resumePreparedSelectedNativeDelivery'])assert.equal(api[name],undefined);
});
