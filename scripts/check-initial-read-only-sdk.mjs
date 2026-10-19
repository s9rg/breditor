/** Source-bound current native fixtures and real Wasm/SDK recovery policy qualification. */
import assert from "node:assert/strict";
import fs from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {fileEvidence,saveEvidence,sourceEvidence} from "./candidate-release/evidence.mjs";
import {probeInitialReadOnly} from "./probe-initial-read-only.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");if(process.argv.length!==2)throw Error("No arguments expected");
const source=sourceEvidence(root),path="target/room-participant-inventory-native.json",native=JSON.parse(fs.readFileSync(resolve(root,path),"utf8"));assert.equal(native.passed,true);assert.deepEqual(native.source,source);for(const file of native.files)assert.deepEqual(fileEvidence(root,file.path),file);
const acceptance=await probeInitialReadOnly(resolve(root,"target/promoted-shared-web"),native.manifest);assert.equal(acceptance.passed,true);assert.deepEqual(sourceEvidence(root),source);
const report={format:"breditor/initial-read-only-sdk-check",formatVersion:1,passed:true,source,nativeEvidence:fileEvidence(root,path),acceptance};saveEvidence(resolve(root,"target/initial-read-only-sdk.json"),report);console.log(JSON.stringify(report,null,2));
