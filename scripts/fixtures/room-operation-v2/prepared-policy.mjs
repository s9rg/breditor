/** Reopen an interrupted prepared parent with explicit current permissions.
 * The staged read-only source is provenance, never today's document/review policy. */
import assert from 'node:assert/strict';
async function closeParts(parts){for(const row of [...parts.participants].reverse()){const p=row.parts;if(row.family==='original'){await p.sources.revisions?.close();await p.sources.suggestions?.close();await p.sources.versions?.close();await p.session.close();}else await p.source.session.close();p.uploads.close();}}
export async function checkPreparedCurrentPolicy({api,input,chosen,policyCandidates=chosen,tag,family='original',finish=owner=>owner.finish()}){
 const selected=policyCandidates.find(row=>row.family===family);assert.ok(selected);const prefix=tag+'-prepared-policy-'+family,requests=[selected].map((row,index)=>({...row,recovery:{...row.recovery,database:prefix+'-attempt-'+index,destinations:Object.fromEntries(Object.keys(row.recovery.destinations).map(k=>[k,prefix+'-'+index+'-'+k]))}})),targets=requests.map(row=>({id:row.id,family:row.family,operationDatabase:prefix+'-operation-'+row.id})),catalogDatabase=prefix+'-catalog',database=prefix+'-parent';
 let archive,catalog,owner,parts,count=0;
 try{
  archive=await api.SharedRoomRecoveryCatalogArchiveV2.capture({...input,catalog:prefix});const expected=archive.selection();catalog=await api.SharedRoomRecoveryCatalogV2.begin({database:catalogDatabase,archive,expected,checkAuthority(){}});await catalog.stage(requests);owner=await api.SharedRoomOperationalRecoveryV2.begin({database,catalog,expected,participants:targets,checkAuthority(){}});await catalog.close();catalog=undefined;assert.equal((await owner.progress()).phase,'prepared');await owner.close();owner=undefined;
  const resume={database,catalogDatabase,expected,participants:requests.map((row,index)=>({...row,operationDatabase:targets[index].operationDatabase,currentPolicy:{documentReadOnly:false,reviewAccess:'comment'}})),checkAuthority(){}};
  owner=await api.SharedRoomOperationalRecoveryV2.resume(resume);await finish(owner);parts=await owner.intoParts();owner=undefined;
  for(const row of parts.participants){const core=row.family==='original'?row.parts.session.core:row.parts.source.session.core;assert.equal(core.view().readOnly===true,false,row.family+' must use explicit current document policy before returning a recovered child');core.select({kind:'text',anchor:{block:'p',offset:'0',affinity:'after'},focus:{block:'p',offset:'0',affinity:'after'}});core.type('Current prepared policy');core.undo();core.dispatchReview({kind:'create_thread',data:{anchorJson:core.captureReviewAnchor({kind:'document'}),body:'Current prepared review policy'}});core.undoReview();count++;}
 }finally{if(parts)await closeParts(parts);await owner?.discardAndClose();await catalog?.discardAndClose();archive?.dispose();}
 return{preparedCurrentPolicyParticipants:count};
}
