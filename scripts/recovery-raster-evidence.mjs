/** Verify the real inactive-host observation and exact persisted client bytes. */
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {join,dirname} from 'node:path';import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function checkRecoveryRasterEvidence(log){
 const matches=[...log.matchAll(/^# INACTIVE_RECOVERY_NATIVE (.+)$/gm)];assert.equal(matches.length,1);
 const evidence=JSON.parse(matches[0][1]);assert.equal(evidence.format,'breditor/inactive-recovery-raster-observation');assert.equal(evidence.formatVersion,1);
 for(const [key,value]of Object.entries({participants:7,uploadRoles:14,payloads:3,normalAttempts:0,commitRequests:1,readOnlyCaptureBeforeActivation:true,completePacketRecovery:true,actualInactiveNativeInspection:true,nativeStampsUnchanged:true,metadataLanesUnchanged:true,cacheCalls:0,actualEpochAdvancedOnce:true,wholeRoomActivated:false}))assert.equal(evidence[key],value,key);
 assert.ok(evidence.rasterRequests>0);assert.match(evidence.remoteOnlyAsset,/^sha256:[a-f0-9]{64}$/);assert.equal(sha(readFileSync(evidence.file)),evidence.sha256);
 for(const part of evidence.files){assert.equal(part.name.includes('/'),false);const bytes=readFileSync(join(dirname(evidence.file),part.name));assert.equal(bytes.length,part.bytes);assert.equal(sha(bytes),part.sha256);}
 assert.match(log,/INACTIVE_RECOVERY_STEP normal-serving-stopped-read-only-current-controls-open/);assert.match(log,/INACTIVE_RECOVERY_STEP complete-three-raster-seven-client-byte-capture-before-activation/);
 return evidence;
}
