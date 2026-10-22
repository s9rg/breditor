/** Reentry must refuse the changing capture, not destroy the real author or offline work. */
import assert from'node:assert/strict';import{insertCleanupText}from'../owned-core-cleanup/session.mjs';import{captureRestoredGraph}from'../../../packages/breditor-collaboration/dist/restored_graph/capture.js';
import{internalFailureChain}from'../../../packages/breditor-collaboration/dist/internal_failure_cause.js';
export async function proveCaptureReentry({source,assets,readOptions,readSource}){
 const history=readOptions.session.documentHistory,key=history.kind==='original'?'restoreOriginal':'restoreSegmented',restore=history[key];let changed=false;const session={...readOptions.session,documentHistory:{...history,[key]:async function(checkpoint){const raw=await restore.call(history,checkpoint);if(!changed){changed=true;insertCleanupText(source.core,'Changed during read factory ');}return raw;}}};
 await assert.rejects(captureRestoredGraph({source,assets,...readOptions,session}),e=>e.code==='participant_authority'&&internalFailureChain(e).some(c=>c.code==='restored_graph_capture_changed'));assert.equal(changed,true);const expected=readSource(),retry=await captureRestoredGraph({source,assets,...readOptions});assert.equal(retry.kind,'ready');try{assert.deepEqual(retry.archive.liveSource(),expected);}finally{retry.archive.dispose();}await assert.rejects(source.flush());
}
