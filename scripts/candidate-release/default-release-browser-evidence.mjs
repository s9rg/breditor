/** Retained case evidence for the candidate's two default-package browser checks. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import {validateDefaultBrowserReport} from "./default-browser-report.mjs";

const format="breditor/default-release-browser";
const marker="scripts/candidate-release/default-release-browser-evidence.mjs";
export const defaultReleaseBrowserChecks=Object.freeze(["browser-matrix","demo-matrix"]);
export const defaultReleaseBrowserPath=id=>`target/default-release-browser-evidence/${id}.json`;
export const usesDefaultReleaseBrowserEvidence=root=>existsSync(resolve(root,marker));

export function defaultReleaseBrowserEvidence(check,discovery,report){
 return {format,formatVersion:1,check,discovery,...(report?{report}:{})};
}

export function verifyDefaultReleaseBrowserStage(root,directory,stage){
 if(stage.id!=="default-package-release-matrix"||!usesDefaultReleaseBrowserEvidence(root))return;
 for(const check of defaultReleaseBrowserChecks){
  const path=defaultReleaseBrowserPath(check),retained=`artifacts/${stage.id}/${path}`;
  const artifact=stage.artifacts.find(row=>row.path===path);
  assert.ok(artifact?.retainedPath===retained,`Missing retained default release ${check} evidence`);
  const bytes=readFileSync(resolve(directory,retained));
  assert.equal(createHash("sha256").update(bytes).digest("hex"),artifact.sha256,`Retained default release ${check} evidence changed`);
  const evidence=JSON.parse(bytes);
  assert.ok(evidence.format===format&&evidence.formatVersion===1&&evidence.check===check&&evidence.discovery&&evidence.report,
   `Invalid retained default release ${check} evidence`);
  validateDefaultBrowserReport(evidence.discovery,evidence.report);
 }
}
