/** Require actual complete byte/current captures and the original checked-read compatibility path. */
import assert from 'node:assert/strict';
const parse=(log,marker)=>[...log.matchAll(new RegExp('^# '+marker+' (\\{[^\\n]+\\})$','gm'))].map(row=>JSON.parse(row[1]));
export function checkReconciledPacketEvidence(log,id){
 const rows=parse(log,'RECONCILED_RECOVERY_NATIVE');
 assert.equal(rows.length,id==null?2:Number(id==='availability'||id==='checked'));
 if(id==null||id==='checked')assert.ok(rows.some(row=>row.currentKind==='checked'));
 for(const row of rows){assert.equal(row.participants,7);assert.equal(row.bytesKind,'retained');assert.equal(row.originalKind,'pending');assert.equal(row.uploadRoles,14);assert.equal(row.cacheCalls,0);assert.equal(row.diskNativeInspection,true);assert.equal(row.originalMetadataLanesUnchanged,true);assert.equal(row.allNativeStampsUnchanged,true);assert.equal(row.wholeRoomActivated,false);for(const entry of Object.values(row.binding)){assert.ok(entry.bytes>0);assert.match(entry.sha256,/^[a-f0-9]{64}$/);}assert.ok(row.currentData.bytes>0);assert.match(row.currentData.sha256,/^[a-f0-9]{64}$/);}
 const legacy=parse(log,'LAZY_VERSION_RECONCILIATION_NATIVE');assert.equal(legacy.length,Number(id==null||id==='compatibility'));
 for(const row of legacy){assert.equal(row.currentKind,'checked');assert.equal(row.originalKind,'pending');assert.equal(row.forbiddenBodyDownloads,0);assert.equal(row.cacheCalls,0);}
 const refused=parse(log,'RECONCILED_RECOVERY_FINAL_REFUSAL');assert.equal(refused.length,Number(id==null||id==='checked'));
 for(const row of refused){for(const key of ['triggeredAtFinalResult','refused','metadataOwnerRetired','metadataLanesUnchanged','nativeStampsUnchanged'])assert.equal(row[key],true,key);assert.equal(row.nativeParticipants,7);assert.equal(row.cacheCalls,0);assert.equal(row.wholeRoomActivated,false);}
 return {rows,legacy,refused};
}
