/** Verify the context shipped alongside a hosted candidate artifact. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {basename,dirname,join} from "node:path";
import {fileEvidence} from "./evidence.mjs";

const contextFile="runner-context.tsv";
const successfulSteps=["checkout","node","rust","npm","cargo","candidate"];
const keys=[
 "format","repository","workflow","event","runId","runAttempt",
 "revision","profile","shard","os","arch","browsers",...successfulSteps,
].sort();

export function verifyHostedContext(directory,receipt){
 assert.match(basename(directory),/^run-[a-z0-9]+$/i,"Hosted results must remain in their downloaded run directory");
 const root=dirname(directory),context=fileEvidence(root,contextFile);
 assert.ok(context.bytes<=8192,"Hosted runner context exceeds its size bound");
 const bytes=readFileSync(join(root,contextFile));
 assert.equal(createHash("sha256").update(bytes).digest("hex"),context.sha256,"Hosted runner context changed while reading");
 const rows=bytes.toString("utf8").trimEnd().split("\n").map(line=>line.split("\t"));
 assert.ok(rows.every(row=>row.length===2),"Malformed hosted runner context");
 assert.deepEqual(rows.map(([key])=>key).sort(),keys,"Unexpected or duplicate hosted runner context fields");
 const value=Object.fromEntries(rows);
 assert.equal(value.format,"1","Unsupported hosted runner context");
 assert.match(value.repository,/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i,"Missing GitHub repository identity");
 const workflow=`${value.repository}/.github/workflows/candidate-qualification.yml@`;
 assert.ok(value.workflow.startsWith(workflow)&&/^refs\/(?:heads|tags)\/[^\s]+$/.test(value.workflow.slice(workflow.length)),
  "Hosted runner context names a different workflow");
 assert.equal(value.event,"workflow_dispatch");
 for(const field of ["runId","runAttempt"])assert.match(value[field],/^[1-9][0-9]{0,19}$/,`Invalid hosted ${field}`);
 assert.equal(value.revision,receipt.source.commit,"Hosted runner revision differs from the receipt");
 assert.equal(value.profile,receipt.profile,"Hosted runner profile differs from the receipt");
 assert.equal(value.shard,receipt.shard?.id??"none","Hosted runner shard differs from the receipt");
 assert.deepEqual([value.os,value.arch,receipt.environment?.platform,receipt.environment?.arch],
  ["Linux","X64","linux","x64"],"Hosted runner and receipt must name the candidate Linux x64 host");
 for(const step of successfulSteps)assert.equal(value[step],"success",`Hosted runner step ${step} did not succeed`);
 assert.ok(["success","skipped"].includes(value.browsers),"Hosted browser setup did not succeed or skip");
 return {repository:value.repository,workflow:value.workflow,runId:value.runId,
  runAttempt:value.runAttempt,contextSha256:context.sha256};
}
