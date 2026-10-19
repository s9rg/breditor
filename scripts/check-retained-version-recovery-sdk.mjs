/** Source-bound native local version reconciliation. No platform or room activation approval. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {sourceEvidence,saveEvidence} from "./candidate-release/evidence.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
export function checkRetainedVersionRecovery(){const source=sourceEvidence(root),acceptance=JSON.parse(execFileSync(process.execPath,["scripts/probe-retained-version-recovery.mjs","target/promoted-shared-web"],{cwd:root,encoding:"utf8",maxBuffer:1024*1024,timeout:360000}));assert.deepEqual(sourceEvidence(root),source);
 for(const[key,value]of Object.entries({passed:true,cases:30,retainedOriginalPackets:30,retainedCurrentPackets:30,idempotentRetries:30,coldReopens:60,futureNativeHistoryComparisons:180,forgedSourceRefusals:30,closedSourceRefusals:30,missingVersionSourceRefusals:36,intentConflictRefusals:30,concurrentMutationRefusals:145,abortedSaveRetries:1,committedBeforeAcknowledgementRetries:1,sourceDisposalsAfterAdmission:1,networkCalls:0}))assert.equal(acceptance[key],value,key);
 const report={format:"breditor/retained-version-recovery-sdk-check",formatVersion:1,passed:true,source,acceptance};saveEvidence(resolve(root,"target/retained-version-recovery-sdk.json"),report);return report;}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==2)throw Error("No arguments expected");console.log(JSON.stringify(checkRetainedVersionRecovery(),null,2));}
