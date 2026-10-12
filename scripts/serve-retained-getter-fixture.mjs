// Local native-browser comparison. Serves verified retained bytes unchanged.
import assert from "node:assert/strict";
import {readFile,realpath} from "node:fs/promises";
import {createHash} from "node:crypto";
import {dirname,join,relative,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {preview} from "vite";
import {verifyFailureBundle} from "./retain-nested-list-failure.mjs";

assert.equal(process.argv.length,3,"provide retained getter measurement.json");
const repository=await realpath(fileURLToPath(new URL("../",import.meta.url)));
const path=await realpath(resolve(process.argv[2]));
assert.match(relative(join(repository,"target/nested-list-reproductions"),path),/^failure-[a-zA-Z0-9]+\/measurement\.json$/u);
const directory=dirname(path);
const manifest=JSON.parse(await readFile(join(directory,"retention.json")));
await verifyFailureBundle(path,manifest);
const bytes=await readFile(path),source=JSON.parse(bytes);
assert.equal(source.fixtureKind,"nested-getter-probe");
const server=await preview({configFile:false,root:directory,logLevel:"warn",build:{outDir:join(directory,"bundle")},preview:{host:"127.0.0.1",port:0,strictPort:true}});
const address=server.httpServer.address();assert.ok(address&&typeof address!=="string");
console.log(JSON.stringify({url:`http://127.0.0.1:${address.port}/`,source:path,sourceSha256:createHash("sha256").update(bytes).digest("hex"),rebuilt:false,releaseQualified:false}));
await new Promise(resolveClose=>{
  const close=()=>server.httpServer.close(resolveClose);
  process.once("SIGINT",close);process.once("SIGTERM",close);
});
await verifyFailureBundle(path,manifest);
