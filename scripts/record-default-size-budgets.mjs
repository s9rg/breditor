/** Capture supported artifact measurements even if the release ceilings fail. */
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdirSync,realpathSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {saveEvidence} from "./candidate-release/evidence.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
export const defaultSizeBudgetReport="target/default-size-budgets.json";

export function validateDefaultSizeReport(report,status){
 assert.equal(report.format,"breditor/default-size-budgets");
 assert.equal(report.formatVersion,1);
 assert.ok(Array.isArray(report.budgets)&&report.budgets.length>0);
 assert.equal(new Set(report.budgets.map(row=>row.label)).size,report.budgets.length);
 for(const {label,actual,maximum,remaining,passed} of report.budgets){
  assert.ok(typeof label==="string"&&label.length>0);
  assert.ok([actual,maximum].every(value=>Number.isSafeInteger(value)&&value>0));
  assert.equal(remaining,maximum-actual);
  assert.equal(passed,remaining>=0);
 }
 assert.equal(report.passed,report.budgets.every(row=>row.passed));
 assert.equal(status,report.passed?0:1);
 return report;
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2)throw Error("Usage: node scripts/record-default-size-budgets.mjs");
 const {error,status,stdout,stderr}=spawnSync(process.execPath,["scripts/check-size-budgets.mjs","--json"],{cwd:root,encoding:"utf8"});
 if(error)throw error;
 if(stderr)process.stderr.write(stderr);
 const report=validateDefaultSizeReport(JSON.parse(stdout),status);
 const path=resolve(root,defaultSizeBudgetReport);
 mkdirSync(dirname(path),{recursive:true});
 saveEvidence(path,report);
 console.log(JSON.stringify(report,null,2));
}
