/** Verify the context shipped alongside a hosted candidate artifact. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {basename,dirname,join} from "node:path";
import {fileEvidence} from "./evidence.mjs";

const contextFile="runner-context.tsv";
const workflowFile=".github/workflows/candidate-qualification.yml";
const successfulSteps=["checkout","node","rust","npm","cargo","candidate"];
const browserStages=new Set([
 "default-package-release-matrix","installed-editor-browser-matrix","installed-application-network-matrix",
 "rich-browser-chromium","rich-browser-firefox","rich-browser-webkit","shared-browser-matrix","rich-demo-latency",
 "installed-search-browser","installed-placeholder-browser","installed-fullscreen-browser",
 "installed-session-backups-browser","installed-asset-backups-browser",
]);
const keys=[
 "format","repository","workflow","event","runId","runAttempt",
 "revision","profile","shard","os","arch","browsers",...successfulSteps,
].sort();

function pinnedNodeVersion(root){
 const workflow=JSON.parse(readFileSync(join(root,workflowFile),"utf8"));
 const steps=workflow.jobs?.qualify?.steps?.filter(step=>step.id==="node");
 const version=steps?.[0]?.with?.["node-version"];
 assert.ok(steps?.length===1&&/^actions\/setup-node@[a-f0-9]{40}$/u.test(steps[0].uses)&&
  typeof version==="string"&&/^[0-9]+\.[0-9]+\.[0-9]+$/u.test(version),
  "Candidate qualification workflow must pin an exact Node version");
 return `v${version}`;
}

export function readHostedRunnerContext(root){
 const context=fileEvidence(root,contextFile);
 assert.ok(context.bytes<=8192,"Hosted runner context exceeds its size bound");
 const bytes=readFileSync(join(root,contextFile));
 assert.equal(createHash("sha256").update(bytes).digest("hex"),context.sha256,"Hosted runner context changed while reading");
 const rows=bytes.toString("utf8").trimEnd().split("\n").map(line=>line.split("\t"));
 assert.ok(rows.every(row=>row.length===2),"Malformed hosted runner context");
 assert.deepEqual(rows.map(([key])=>key).sort(),keys,"Unexpected or duplicate hosted runner context fields");
 const value=Object.fromEntries(rows);
 assert.equal(value.format,"1","Unsupported hosted runner context");
 assert.match(value.repository,/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i,"Missing GitHub repository identity");
 const workflow=`${value.repository}/${workflowFile}@`;
 assert.ok(value.workflow.startsWith(workflow)&&/^refs\/(?:heads|tags)\/[^\s]+$/.test(value.workflow.slice(workflow.length)),
  "Hosted runner context names a different workflow");
 assert.equal(value.event,"workflow_dispatch");
 for(const field of ["runId","runAttempt"])assert.match(value[field],/^[1-9][0-9]{0,19}$/,`Invalid hosted ${field}`);
 return {context:value,sha256:context.sha256};
}

export function verifyHostedContext(candidateRoot,directory,receipt,plan){
 assert.match(basename(directory),/^run-[a-z0-9]+$/i,"Hosted results must remain in their downloaded run directory");
 const {context:value,sha256}=readHostedRunnerContext(dirname(directory));
 assert.equal(value.revision,receipt.source.commit,"Hosted runner revision differs from the receipt");
 assert.equal(value.profile,receipt.profile,"Hosted runner profile differs from the receipt");
 assert.equal(value.shard,receipt.shard?.id??"none","Hosted runner shard differs from the receipt");
 assert.deepEqual([value.os,value.arch,receipt.environment?.platform,receipt.environment?.arch],
  ["Linux","X64","linux","x64"],"Hosted runner and receipt must name the candidate Linux x64 host");
 for(const step of successfulSteps)assert.equal(value[step],"success",`Hosted runner step ${step} did not succeed`);
 assert.ok(receipt.environment?.node===pinnedNodeVersion(candidateRoot),"Hosted receipt Node version differs from the candidate workflow pin");
 const expectedBrowserSetup=plan.checks.some(check=>browserStages.has(check.id))?"success":"skipped";
 assert.equal(value.browsers,expectedBrowserSetup,"Hosted browser setup differs from the selected qualification");
 return {repository:value.repository,workflow:value.workflow,runId:value.runId,
  runAttempt:value.runAttempt,contextSha256:sha256};
}
