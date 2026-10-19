/** Source-bound real native pending queue/outbox retention, never full room/V1 approval. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {sourceEvidence,saveEvidence} from "./candidate-release/evidence.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
export function checkPendingRecovery(){const source=sourceEvidence(root),acceptance=JSON.parse(execFileSync(process.execPath,["scripts/probe-pending-recovery.mjs","target/promoted-shared-web"],{cwd:root,encoding:"utf8",maxBuffer:1024*1024,timeout:360000}));assert.deepEqual(sourceEvidence(root),source);
 for(const[key,value]of Object.entries({passed:true,cases:30,originalProposals:30,originalRevisions:30,currentProposals:30,currentRevisions:30,idempotentRetries:60,coldStoreReopens:120,nativeColdReopens:30,futureNativeHistoryComparisons:180,forgedSourceRefusals:60,closedSourceRefusals:60,intentConflictRefusals:60,concurrentRefusals:986,abortedSaveRetries:2,committedBeforeAcknowledgementRetries:2,sourceDisposalsAfterAdmission:2,delayedConnectRefusals:2,openingRecoveryRefusals:1,openingAuthorityChecks:7,openingFailureReopens:1,reentrantOpeningRefusals:7,failedSubscriptionRefusals:1,networkCalls:0}))assert.equal(acceptance[key],value,key);
 const report={format:"breditor/pending-recovery-sdk-check",formatVersion:1,passed:true,source,acceptance};saveEvidence(resolve(root,"target/pending-recovery-sdk.json"),report);return report;}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==2)throw Error("No arguments expected");console.log(JSON.stringify(checkPendingRecovery(),null,2));}
