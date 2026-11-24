/** Bind the prerequisite Native cohort reports to the selected candidate source. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {fileEvidence} from "./evidence.mjs";

const cohorts=[
 ["target/complete-cohort-native.json","breditor/native-complete-cohort-check"],
 ["target/complete-image-cohort-native.json","breditor/native-complete-image-cohort-check"],
];

export function currentNativeCohortEvidence(root,source){
 return cohorts.map(([path,format])=>{
  const {bytes,sha256}=fileEvidence(root,path);
  const raw=readFileSync(join(root,path));
  assert.equal(createHash("sha256").update(raw).digest("hex"),sha256,`Native cohort evidence changed during admission: ${path}`);
  const receipt=JSON.parse(raw);
  assert.equal(receipt.format,format,path);
  assert.equal(receipt.formatVersion,1,path);
  assert.equal(receipt.passed,true,path);
  assert.deepEqual(receipt.source,source,`Native cohort evidence belongs to another candidate: ${path}`);
  return {path,bytes,sha256};
 });
}
