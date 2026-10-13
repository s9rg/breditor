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
export async function prepareRetainedBootstrapTrace(sourcePath,retentionRoot,{ownerFaults=false,smallRestoreChurn=false}={}) {
  assert.equal(typeof ownerFaults,"boolean");
  assert.equal(typeof smallRestoreChurn,"boolean");
  sourcePath=await realpath(sourcePath);
  const originalRetention=await readFile(join(dirname(sourcePath),"retention.json"));
  const control=JSON.parse(originalRetention);
  assert.notEqual(control.diagnosticDerivation,true,"nested diagnostic derivation unsupported");
  const {source,files}=await verifyFailureBundle(sourcePath,control);
  assert.ok(source.status==="failed"||control.replaySha256!==undefined,"trace requires failed provenance");
  assert.equal(source.browserName,"webkit");
  const scripts=Object.keys(source.bundleAssets).filter(name=>name.endsWith(".js"));
  assert.equal(scripts.length,1);
  const asset=scripts[0],original=files[`bundle/assets/${asset}`],code=original.toString("utf8");
  assert.deepEqual(Buffer.from(code),original,"script is not lossless UTF-8");
  const traced=traceRetainedBootstrapFailures(code,{ownerFaults,smallRestoreChurn}),bytes=Buffer.from(traced.code);
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
    tracedAssetSha256:hash(bytes),sites:traced.sites,ownerFaults,smallRestoreChurn,rebuilt:false,remangled:false,originalControlModified:false};
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
  assert.ok(flags.every(flag=>["--owner-faults","--small-restore-churn"].includes(flag))&&new Set(flags).size===flags.length,
    "usage: node scripts/prepare-retained-bootstrap-failure-trace.mjs <retained measurement.json> [--owner-faults] [--small-restore-churn]");
  assert.ok(process.argv[2]);
  const repository=await realpath(fileURLToPath(new URL("../",import.meta.url)));
  const root=join(repository,"target/nested-list-reproductions"),source=await realpath(resolve(process.argv[2]));
  assert.match(relative(root,source),/^(?:failure|trace)-[a-zA-Z0-9]+\/measurement\.json$/u);
  const result=await prepareRetainedBootstrapTrace(source,root,{ownerFaults:flags.includes("--owner-faults"),smallRestoreChurn:flags.includes("--small-restore-churn")});
  console.log(JSON.stringify({output:result.output,measurementPath:result.measurementPath,
    sites:result.derivation.sites.length,rebuilt:false,remangled:false}));
}
