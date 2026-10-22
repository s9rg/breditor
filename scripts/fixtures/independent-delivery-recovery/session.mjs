/** Explicit recovery host selection. No factory or permission is discovered from the archive. */
export function recoveryFactory(options,{readOnly=true,access='read_only'}={}){
 const keys=['room','writer','richLanguage','history','rangeEditing','selectionEditing','searchHistory','reviewedHistory','documentHistory','reviewHistory','binding','retained','editor','onError','onState'];
 return{...Object.fromEntries(keys.filter(k=>Object.hasOwn(options,k)).map(k=>[k,options[k]])),readOnly,review:{...options.review,access}};
}
export function recoveryOptions(options,backup,tag,{checkAuthority=()=>{},signal}={}){
 return{database:tag+'-attempt',expected:backup.selection(),destinations:{source:tag+'-source',uploads:tag+'-uploads'},session:recoveryFactory(options),checkAuthority,...(signal?{signal}:{})};
}
const evidence={cuts:0,finishes:0,handoffs:0,wholeUploads:0,retainedOriginalFiles:0,readOnlyRefusals:0,currentPolicyReopens:0};
export function resetRecoveryEvidence(){for(const key of Object.keys(evidence))evidence[key]=0;}
export const recoveryEvidence=()=>Object.freeze({...evidence});
/** Two genuine cold coordinator lifecycles, then a separately selected current-policy source reopen. */
export async function restoreParticipantThroughRecovery({api,options,backup,uploadsDatabase}){
 const assert=(await import('node:assert/strict')).default,bytes=async blob=>Buffer.from(await blob.arrayBuffer()),selected={database:options.database+'-recovery-attempt',expected:backup.selection(),destinations:{source:options.database,uploads:uploadsDatabase},session:recoveryFactory(options),checkAuthority(){}},before=backup.sourceRecovery(),originalFile=await bytes(backup.file()),uploadsFile=await bytes(backup.uploadBackup());let attempt,ready,parts,session,finished=false;
 try{for(const cold of [false,true]){attempt=cold?await api.SharedIndependentDeliveryParticipantRecovery.resume(selected):await api.SharedIndependentDeliveryParticipantRecovery.begin({...selected,backup});ready=await attempt.finish();evidence.finishes++;assert.deepEqual(await bytes(ready.file()),originalFile);evidence.retainedOriginalFiles++;parts=await ready.intoParts();ready=undefined;evidence.handoffs++;assert.equal(parts.source.session.core.view().readOnly,true);assert.throws(()=>parts.source.session.core.type('Forbidden'));assert.throws(()=>parts.source.session.core.undoReview());evidence.readOnlyRefusals+=2;assert.deepEqual(parts.source.session.exportRecovery(),before);assert.deepEqual(await bytes(await parts.uploads.exportBackup()),uploadsFile);evidence.wholeUploads++;await parts.source.session.close();if(!cold){parts.uploads.close();parts=undefined;}}
  session=await api.SharedIndependentDeliverySession.open(options);assert.deepEqual(session.exportRecovery(),before);assert.equal(session.core.view().readOnly===true,options.readOnly);evidence.currentPolicyReopens++;evidence.cuts++;finished=true;return{session,uploads:parts.uploads};
 }finally{if(!finished){await session?.discardAndClose();await parts?.source.session.discardAndClose();parts?.uploads.close();await ready?.discardAndClose();await attempt?.close();}}
}
