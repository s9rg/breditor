/** Actual process IDs/exit and separately retained old/new coordination states. */
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {checkRecoveryRasterEvidence} from './recovery-raster-evidence.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function checkNativeProcessEvidence(log){
 checkRecoveryRasterEvidence(log);
 const failedBoot=[...log.matchAll(/^# NATIVE_PROCESS_FAILED_BOOT (.+)$/gm)].map(row=>JSON.parse(row[1]));assert.equal(failedBoot.length,1);for(const key of ['actualOldProcessExited','corruptCheckpointRefused','originalErrorPreserved','cleanupCompleted','repeatedCleanupCompleted','oldOwnerRemainsClosed','authorityUnchanged','corruptDataPreserved'])assert.equal(failedBoot[0][key],true,key);assert.equal(sha(readFileSync(failedBoot[0].artifact.file)),failedBoot[0].artifact.sha256);
 const direct=[...log.matchAll(/^# NATIVE_PROCESS_DIRECT (.+)$/gm)].map(row=>JSON.parse(row[1]));assert.equal(direct.length,2);assert.deepEqual(direct.map(row=>row.committed).sort(),[false,true]);for(const row of direct){assert.equal(row.actualExitSignal,'SIGKILL');assert.notEqual(row.oldProcessId,row.newProcessId);for(const key of ['newInactiveControlVerified','rasterReadBeforeActivation','freshAccountVerified','oldAccountRefused','protectedCredentialsUnchanged','actualNextServiceActivated'])assert.equal(row[key],true,key);}
 const matches=[...log.matchAll(/^# NATIVE_PROCESS_RECOVERY_NATIVE (.+)$/gm)];assert.equal(matches.length,1);const result=JSON.parse(matches[0][1]);assert.equal(result.format,'breditor/native-process-sdk-recovery-observation');
 for(const [key,value]of Object.entries({participants:7,retainedOfflineLanes:14,oldIntentPhase:'request-started',oldReceiptRemainsNull:true,oldIntentUnchangedByNewCommit:true,freshNativeInstance:true,successfulCommits:2,deniedOldSelections:1,separateFreshApprovals:2,completeByteRecoveryBeforeFreshActivation:true,nativeStampsUnchanged:true,metadataLanesUnchanged:true,actualFreshServiceResumed:true,wholeRoomActivated:false}))assert.equal(result[key],value,key);
 assert.equal(result.crash.signal,'SIGKILL');assert.equal(result.crash.actualOldProcessExited,true);assert.notEqual(result.crash.processId,result.crash.reopenedProcessId);assert.equal(BigInt(result.newPlanned.generation),BigInt(result.oldPlanned.generation)+1n);assert.equal(sha(readFileSync(result.file)),result.sha256);
 for(const pin of [result.nativeReopen,result.nativeCommit]){const bytes=readFileSync(pin.file);assert.equal(bytes.length,pin.bytes);assert.equal(sha(bytes),pin.sha256);}
 return result;
}
