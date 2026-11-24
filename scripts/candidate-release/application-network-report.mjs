/** Validate actual results across Playwright’s separate project/file suites. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {installedNetworkSpecs} from "../../experiments/shared-browser/installed-network-specs.mjs";
import {relayNoticePaths} from "../build-relay-notices.mjs";
import {sharedBrowserWebKitGroups} from "../shared-browser-runs.mjs";
import {sharedBrowserBatchProjects,validateSharedBrowserReport} from "./shared-browser-report.mjs";

const reportPath="target/shared-application-browser-report.json";
const sha256=/^[a-f0-9]{64}$/u;
const productionInputs={
 archives:["installed-editor-pairing","target/editor-installed-consumer.json"],
 relay:["relay-native-dependency-notices",relayNoticePaths[0]],
 vector:["shared-browser-vector","target/collaboration-feasibility-web/native-vector.json"],
 raster:["shared-browser-raster-fixtures","target/relay-raster-fixtures.json"],
};
const projects=sharedBrowserBatchProjects({projects:["webkit*"],specs:installedNetworkSpecs},installedNetworkSpecs,
 sharedBrowserWebKitGroups(installedNetworkSpecs));
for(const [file,webkit] of projects)projects.set(file,["chromium","firefox",...webkit]);

export function validateApplicationNetworkReport(report){
 const {expected,skipped,unexpected,flaky}=report.stats;
 assert.ok(Number.isSafeInteger(expected)&&expected>0);
 assert.deepEqual({skipped,unexpected,flaky},{skipped:0,unexpected:0,flaky:0});
 const pilotCases=[
  "the first-party pilot opens independent participants and verifies an offline checkpoint after reload",
  "the pilot supports keyboard sign-in and checkpoint recovery at a narrow viewport",
 ];
 const pilotSpecs=report.suites.filter(suite=>suite.file==="network-demo.spec.mjs").flatMap(suite=>suite.specs??[]);
 for(const title of pilotCases){
  const tests=pilotSpecs.filter(spec=>spec.title===title).flatMap(spec=>spec.tests);
  assert.ok(tests.length,`Missing application network pilot case: ${title}`);
  const engines=tests.map(test=>{
   assert.deepEqual(test.results.map(result=>result.status),["passed"],title);
   return test.projectName.replace(/^webkit-[0-9]+$/,"webkit");
  }).sort();
  assert.deepEqual(engines,["chromium","firefox","webkit"],title);
 }
 validateSharedBrowserReport(report,projects);
}

function readApplicationArtifact(directory,stageId,path,record){
 const retainedPath=`artifacts/${stageId}/${path}`;
 assert.ok(record?.retainedPath===retainedPath,`Missing retained application network evidence from ${stageId}`);
 const bytes=readFileSync(resolve(directory,retainedPath));
 assert.equal(createHash("sha256").update(bytes).digest("hex"),record.sha256,`Retained application network evidence changed for ${stageId}`);
 return JSON.parse(bytes);
}

export function verifyApplicationNetworkStage(directory,stage,preceding){
 const record=stage.artifacts.find(artifact=>artifact.path===reportPath);
 const evidence=readApplicationArtifact(directory,stage.id,reportPath,record);
 assert.equal(evidence.format,"breditor/installed-application-network");
 assert.equal(evidence.formatVersion,1);
 validateApplicationNetworkReport(evidence.report);
 const prior=(key)=>{
  const [id,path]=productionInputs[key];
  const producer=preceding.find(stage=>stage.id===id);
  const artifact=producer?.artifacts.find(item=>item.path===path);
  assert.ok(producer?.status==="passed"&&artifact,`Missing preceding application network input from ${id}`);
  return artifact;
 };
 const {inputs}=evidence;
 assert.ok(typeof inputs?.relaySha256==="string"&&sha256.test(inputs.relaySha256),"Missing valid application network relay digest");
 const archives=inputs.archives;
 assert.ok(Array.isArray(archives)&&archives.length>0&&archives.every(archive=>
  typeof archive?.name==="string"&&/^@breditor\/[a-z0-9-]+$/u.test(archive.name)&&
  typeof archive.filename==="string"&&/^[a-z0-9][a-z0-9+._-]*\.tgz$/u.test(archive.filename)&&
  typeof archive.sha256==="string"&&sha256.test(archive.sha256))&&
  new Set(archives.map(archive=>archive.name)).size===archives.length&&new Set(archives.map(archive=>archive.filename)).size===archives.length,
 "Missing valid, unique application network archive identities");
 const archiveReport=readApplicationArtifact(directory,...productionInputs.archives,prior("archives"));
 assert.deepEqual(archives,archiveReport.archiveEvidence.map(({name,filename,sha256})=>({name,filename,sha256})),
  "Application network archives differ from the installed SDK producer");
 const relayReport=readApplicationArtifact(directory,...productionInputs.relay,prior("relay"));
 assert.equal(inputs.relaySha256,relayReport.nativeBuild.executableSha256,"Application network relay differs from the inventoried Native build");
 assert.equal(inputs.vectorSha256,prior("vector").sha256,"Application network vector differs from its producer");
 assert.equal(inputs.rasterFixturesSha256,prior("raster").sha256,"Application network raster fixtures differ from their producer");
}
