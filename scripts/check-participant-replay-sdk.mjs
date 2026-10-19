/** Source-bound actual original native participant replay. No producer or platform approval inferred. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {sourceEvidence,saveEvidence} from "./candidate-release/evidence.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
export function checkParticipantReplaySdk(){
 const source=sourceEvidence(root),acceptance=JSON.parse(execFileSync(process.execPath,["scripts/probe-participant-replay.mjs","target/promoted-shared-web"],{cwd:root,encoding:"utf8",maxBuffer:1024*1024,timeout:360000}));
 assert.deepEqual(sourceEvidence(root),source);for(const[key,value]of Object.entries({passed:true,cases:66,pairedCases:30,documentCases:36,concurrentReadOnlyCopies:66,exactNativeSources:66,actualArchivedByteCaptures:66,currentContinuityChecks:198,closedSourceRefusals:66,sourceDisposals:132,forgedCurrentRefusals:66,reentrantSourceDisposals:1,currentClosedDuringAuthorityRefusals:1,forbiddenCalls:0}))assert.equal(acceptance[key],value,key);assert.ok(acceptance.localBlobReads>0);
 const report={format:"breditor/participant-replay-sdk-check",formatVersion:1,passed:true,source,acceptance};saveEvidence(resolve(root,"target/participant-replay-sdk.json"),report);return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==2)throw Error("No arguments expected");console.log(JSON.stringify(checkParticipantReplaySdk(),null,2));}
