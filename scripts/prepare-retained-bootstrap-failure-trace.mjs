// Derive only cold error logging from verified retained bytes. No rebuild.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir,mkdtemp,readFile,realpath,writeFile} from "node:fs/promises";
import {dirname,join,relative,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {verifyFailureBundle} from "./retain-nested-list-failure.mjs";
import {traceRetainedBootstrapFailures} from "./retained-bootstrap-failure-trace.mjs";
const hash=value=>createHash("sha256").update(value).digest("hex");

/** Preserve original control and full provenance in a separate trace tree. */
export async function prepareRetainedBootstrapTrace(sourcePath,retentionRoot,{ownerFaults=false,ownerImmediateExits=false,smallRestoreChurn=false,checkpointExports=false,inputRoutes=false,checkpointReader=false,checkpointValidation=false,checkpointPredicates=false,checkpointStateComponents=false,checkpointPredicateExits=false,checkpointCapture=false,checkpointContractCapture=false,ownerReasons=false}={}) {
  assert.equal(typeof ownerFaults,"boolean");
  assert.equal(typeof ownerImmediateExits,"boolean");
  assert.equal(typeof smallRestoreChurn,"boolean");
  assert.equal(typeof checkpointExports,"boolean");
  assert.equal(typeof inputRoutes,"boolean");
  assert.equal(typeof checkpointReader,"boolean");
  assert.equal(typeof checkpointValidation,"boolean");
  assert.equal(typeof checkpointPredicates,"boolean");
  assert.equal(typeof checkpointStateComponents,"boolean");
  assert.equal(typeof checkpointPredicateExits,"boolean");
  assert.equal(typeof checkpointCapture,"boolean");
  assert.equal(typeof checkpointContractCapture,"boolean");
  assert.equal(typeof ownerReasons,"boolean");
  sourcePath=await realpath(sourcePath);
  const originalRetention=await readFile(join(dirname(sourcePath),"retention.json"));
  const control=JSON.parse(originalRetention);
  assert.notEqual(control.diagnosticDerivation,true,"nested diagnostic derivation unsupported");
  const {source,files}=await verifyFailureBundle(sourcePath,control);
  assert.ok(source.status==="failed"||control.replaySha256!==undefined,"trace requires failed provenance");
  const failures=source.measurements?.filter(run=>run.status==="failed")??[];
  assert.ok(source.browserName==="webkit"||source.browserName==="all"&&failures.length===1&&failures[0].browser==="webkit",
    "trace requires a WebKit source or a sole recorded WebKit failure in an all-engine source");
  const scripts=Object.keys(source.bundleAssets).filter(name=>name.endsWith(".js"));
  assert.equal(scripts.length,1);
  const asset=scripts[0],original=files[`bundle/assets/${asset}`],code=original.toString("utf8");
  assert.deepEqual(Buffer.from(code),original,"script is not lossless UTF-8");
  const traced=traceRetainedBootstrapFailures(code,{ownerFaults,ownerImmediateExits,smallRestoreChurn,checkpointExports,inputRoutes,checkpointReader,checkpointValidation,checkpointPredicates,checkpointStateComponents,checkpointPredicateExits,checkpointCapture,checkpointContractCapture,ownerReasons}),bytes=Buffer.from(traced.code);
  await mkdir(retentionRoot,{recursive:true});
  const output=await mkdtemp(join(await realpath(retentionRoot),"trace-"));
  await mkdir(join(output,"bundle/assets"),{recursive:true});
  await writeFile(join(output,"bundle/index.html"),files["bundle/index.html"],{flag:"wx"});
  for(const name of Object.keys(source.bundleAssets)) await writeFile(join(output,"bundle/assets",name),
    name===asset?bytes:files[`bundle/assets/${name}`],{flag:"wx"});
  for(const [name,value] of [["original-measurement.json",files["measurement.json"]],
    ["original-retention.json",originalRetention],["original-script.js",original]])
    await writeFile(join(output,name),value,{flag:"wx"});
  const derivation={sourcePath,sourceMeasurementSha256:hash(files["measurement.json"]),
    sourceRetentionSha256:hash(originalRetention),asset,originalAssetSha256:hash(original),
    tracedAssetSha256:hash(bytes),sites:traced.sites,ownerFaults,ownerImmediateExits,smallRestoreChurn,checkpointExports,inputRoutes,checkpointReader,checkpointValidation,checkpointPredicates,checkpointStateComponents,checkpointPredicateExits,checkpointCapture,checkpointContractCapture,ownerReasons,
    ...(source.browserName==="all"?{replayBrowser:"webkit"}:{}),rebuilt:false,remangled:false,originalControlModified:false};
  const measurement={...source,status:"prepared-diagnostic-only",fixture:output,measurements:[],
    diagnosticInstrumentation:true,releaseQualified:false,releasePerformanceQualified:false,
    bundleAssets:{...source.bundleAssets,[asset]:hash(bytes)},retainedBootstrapDerivation:derivation,
    ...(traced.diagnosticWorkload?{diagnosticWorkload:traced.diagnosticWorkload}:{})};
  const measurementBytes=Buffer.from(`${JSON.stringify(measurement,null,2)}\n`);
  await writeFile(join(output,"measurement.json"),measurementBytes,{flag:"wx"});
  const manifest={version:1,originalSourcePath:join(output,"measurement.json"),
    measurementSha256:hash(measurementBytes),indexSha256:hash(files["bundle/index.html"]),
    diagnosticDerivation:true,diagnosticDerivationKind:"bootstrap"};
  await writeFile(join(output,"retention.json"),`${JSON.stringify(manifest,null,2)}\n`,{flag:"wx"});
  await verifyFailureBundle(join(output,"measurement.json"),manifest);
  await verifyFailureBundle(sourcePath,control);
  return {output,measurementPath:join(output,"measurement.json"),derivation};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const flags=process.argv.slice(3);
  assert.ok(flags.every(flag=>["--owner-faults","--owner-immediate-exits","--small-restore-churn","--checkpoint-exports","--input-routes","--checkpoint-reader","--checkpoint-validation","--checkpoint-predicates","--checkpoint-state-components","--checkpoint-predicate-exits","--checkpoint-capture","--checkpoint-contract-capture","--owner-reasons"].includes(flag))&&new Set(flags).size===flags.length,
    "usage: node scripts/prepare-retained-bootstrap-failure-trace.mjs <retained measurement.json> [--owner-faults] [--owner-immediate-exits] [--small-restore-churn] [--checkpoint-exports] [--input-routes] [--checkpoint-reader] [--checkpoint-validation] [--checkpoint-predicates] [--checkpoint-state-components] [--checkpoint-predicate-exits] [--checkpoint-capture] [--checkpoint-contract-capture] [--owner-reasons]");
  assert.ok(process.argv[2]);
  const repository=await realpath(fileURLToPath(new URL("../",import.meta.url)));
  const root=join(repository,"target/nested-list-reproductions"),source=await realpath(resolve(process.argv[2]));
  assert.match(relative(root,source),/^(?:failure|trace)-[a-zA-Z0-9]+\/measurement\.json$/u);
  const result=await prepareRetainedBootstrapTrace(source,root,{ownerFaults:flags.includes("--owner-faults"),ownerImmediateExits:flags.includes("--owner-immediate-exits"),smallRestoreChurn:flags.includes("--small-restore-churn"),checkpointExports:flags.includes("--checkpoint-exports"),inputRoutes:flags.includes("--input-routes"),checkpointReader:flags.includes("--checkpoint-reader"),checkpointValidation:flags.includes("--checkpoint-validation"),checkpointPredicates:flags.includes("--checkpoint-predicates"),checkpointStateComponents:flags.includes("--checkpoint-state-components"),checkpointPredicateExits:flags.includes("--checkpoint-predicate-exits"),checkpointCapture:flags.includes("--checkpoint-capture"),checkpointContractCapture:flags.includes("--checkpoint-contract-capture"),ownerReasons:flags.includes("--owner-reasons")});
  console.log(JSON.stringify({output:result.output,measurementPath:result.measurementPath,
    sites:result.derivation.sites.length,rebuilt:false,remangled:false}));
}
