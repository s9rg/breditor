// Native qualification helper: exact assembled archive + admitted consumer.
// Never writes shipping dist, publishes, or implies release qualification.
import assert from "node:assert/strict";
import {readFile,realpath,mkdtemp} from "node:fs/promises";
import {dirname,join,relative,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {build,preview} from "vite";
import {readQualifiedPair,sha256,tree} from "./build-opt-in-nested-list-package.mjs";

assert.equal(process.argv.length,3,"provide opt-in assembly.json");
const repository=await realpath(fileURLToPath(new URL("../",import.meta.url)));
const path=await realpath(resolve(process.argv[2]));
assert.match(relative(join(repository,"target"),path),/^nested-list-opt-in-[a-zA-Z0-9]+\/assembly\.json$/u);
const assembly=JSON.parse(await readFile(path));
const qualification=JSON.parse(await readFile(join(dirname(path),"consumer-qualification.json")));
assert.equal(assembly.status,"assembled-not-consumer-qualified");assert.equal(assembly.publishable,false);
assert.equal(qualification.status,"passed");assert.equal(qualification.archiveSha256,assembly.sha256);
const consumer=await realpath(qualification.consumer);
assert.equal(consumer,qualification.consumer);
const installed=join(consumer,"node_modules/@breditor/experimental-nested-lists");
assert.equal(await realpath(installed),installed);
const verify=async()=>{
  assert.equal(sha256(await readFile(assembly.archive)),assembly.sha256);
  assert.equal(sha256(await readFile(assembly.inputRecord)),assembly.inputRecordSha256);
  await readQualifiedPair(assembly.inputRecord);
  assert.equal(sha256(JSON.stringify(await tree(assembly.packageDirectory))),assembly.packageTreeSha256);
  assert.deepEqual(await tree(installed),await tree(assembly.packageDirectory));
  assert.equal(sha256(await readFile(join(consumer,"main.ts"))),qualification.fixtureSha256);
  assert.equal(sha256(await readFile(join(consumer,"index.html"))),sha256(await readFile(join(repository,"scripts/fixtures/nested-list-consumer/index.html"))));
};
await verify();
const outDir=await mkdtemp(join(consumer,"native-bundle-"));
await build({configFile:false,root:consumer,logLevel:"warn",build:{outDir,target:"es2022",modulePreload:{polyfill:false}}});
await verify();
const bundleTree=await tree(outDir);
const server=await preview({configFile:false,root:consumer,logLevel:"warn",build:{outDir},preview:{host:"127.0.0.1",port:0,strictPort:true}});
const address=server.httpServer.address();assert.ok(address&&typeof address!=="string");
console.log(JSON.stringify({url:`http://127.0.0.1:${address.port}/?keyboardProbe=1`,archiveSha256:assembly.sha256,fixtureSha256:qualification.fixtureSha256,outDir,bundleTreeSha256:sha256(JSON.stringify(bundleTree)),releaseQualified:false}));
await new Promise(done=>{const close=()=>server.httpServer.close(done);process.once("SIGINT",close);process.once("SIGTERM",close);});
await verify();assert.deepEqual(await tree(outDir),bundleTree);
