/** Actual normal native owners: membership is checked before any packet/receipt inspection. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {SharedRichEditor,reserveNativeRecovery} from '../packages/breditor-collaboration/dist/core.js';
import {nativeRecoveryAdoptSuggestionHistory as adopt} from '../packages/breditor-collaboration/dist/native_recovery/work_admission.js';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
const config={format:'breditor/shared-rich-profile',formatVersion:3,schema:{name:'example/owned-native-membership',version:1},extensions:[]};
test('copied, foreign and ended reservations refuse before receipt accessors execute',()=>{
 const profile=native.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify(config)),descriptor=JSON.parse(profile.descriptor_json()),document=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:{kind:'element',type:'breditor/document',entityId:null,properties:{'breditor/document-id':'room'},children:[{kind:'element',type:'breditor/paragraph',entityId:null,properties:{'breditor/block-id':'p'},children:[]}]}}),a=new SharedRichEditor(profile.create(document,'101')),b=new SharedRichEditor(profile.create(document,'102')),held=reserveNativeRecovery([a]);
 let calls=0;const receipt={get binding(){calls++;throw Error('Receipt must remain unread');}};
 try{assert.throws(()=>adopt({...held},a,{},'packet',receipt),e=>e.code==='native_recovery_work_source');assert.throws(()=>adopt(held,b,{},'packet',receipt),e=>e.code==='native_recovery_member');held.close();assert.throws(()=>adopt(held,a,{},'packet',receipt),e=>e.code==='native_recovery_busy');assert.equal(calls,0);const next=reserveNativeRecovery([a]);try{assert.throws(()=>adopt(held,a,{},'packet',receipt),e=>e.code==='native_recovery_busy');assert.equal(calls,0);}finally{next.close();}}finally{held.close();a.dispose();b.dispose();profile.free();}
});
