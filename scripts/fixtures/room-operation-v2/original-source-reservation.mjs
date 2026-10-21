/** Same supported source reentry assertion for old archives and the repaired SDK.
 * No generation API or private owner DTO is needed to exercise the original port. */
import assert from 'node:assert/strict';
export async function checkOriginalSourceReservation({api,input,chosen,tag,onUnsafeEntry}){
 const prefix=tag+'-original-source-reservation',selected=chosen.find(row=>row.family==='original'||row.family===undefined);assert.ok(selected);const row={id:selected.id,recovery:{...selected.recovery,database:prefix+'-attempt',destinations:Object.fromEntries(Object.keys(selected.recovery.destinations).map(k=>[k,prefix+'-'+k]))}},requests=[row],participants=input.participants.filter(row=>row.family==='original'||row.family===undefined).map(({family:_family,...row})=>row);
 let archive,catalog,owner,parts,armed=false,refused=false;
 try{
  archive=await api.captureSharedRoomRecoveryCatalog({...input,catalog:prefix,participants});const expected=archive.selection();catalog=await api.SharedRoomRecoveryCatalog.begin({database:prefix+'-catalog',archive,expected,checkAuthority(){if(armed){armed=false;assert.throws(()=>{const p=catalog.stage(requests);if(p){p.catch(()=>{});onUnsafeEntry?.();console.error(JSON.stringify({diagnostic:'original-source-staging-was-admitted',tag}));}},error=>error.code==='catalog_in_use');refused=true;}}});await catalog.stage(requests);armed=true;
  owner=await api.SharedRoomOperationalRecovery.begin({database:prefix+'-parent',catalog,expected,participants:[{id:row.id,operationDatabase:prefix+'-child'}],checkAuthority(){}});assert.equal(refused,true);await catalog.close();catalog=undefined;await owner.finish();parts=await owner.intoParts();owner=undefined;assert.equal(parts.participants.length,1);assert.equal(parts.participants[0].parts.session.core.view().readOnly,true);
 }finally{armed=false;if(parts)for(const{parts:p}of parts.participants){await p.sources.revisions?.close();await p.sources.suggestions?.close();await p.sources.versions?.close();await p.session.close();p.uploads.close();}await owner?.discardAndClose();await catalog?.discardAndClose();archive?.dispose();}
 return{originalSourceReentrancyRefusals:1};
}
