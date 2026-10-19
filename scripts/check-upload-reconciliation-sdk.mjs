/** Source-bound native whole-upload reconciliation; not full room or V1 approval. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {sourceEvidence,saveEvidence} from "./candidate-release/evidence.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
export function checkUploadReconciliation(){const source=sourceEvidence(root),acceptance=JSON.parse(execFileSync(process.execPath,["scripts/probe-upload-reconciliation.mjs","target/promoted-shared-web"],{cwd:root,encoding:"utf8",maxBuffer:2*1024*1024,timeout:900000}));assert.deepEqual(sourceEvidence(root),source);
 for(const[key,value]of Object.entries({passed:true,cases:66,pairedCases:30,documentCases:36,originalUploadRows:90,currentOnlyImages:66,sourceOnlyImages:60,explicitConflicts:30,idempotentRetries:66,coldAttemptReopens:132,coldStoreReopens:66,coldNativeComparisons:66,futureDocumentCheckpoints:198,futureReviewCheckpoints:90,closedSourceRefusals:132,forgedSourceRefusals:66,wrongOriginalRefusals:1,retainedFileComparisons:198,recoveryNotifications:0,networkCalls:0}))assert.equal(acceptance[key],value,key);
 const report={format:"breditor/upload-reconciliation-sdk-check",formatVersion:1,passed:true,source,acceptance};saveEvidence(resolve(root,"target/upload-reconciliation-sdk.json"),report);return report;}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==2)throw Error("No arguments expected");console.log(JSON.stringify(checkUploadReconciliation(),null,2));}
