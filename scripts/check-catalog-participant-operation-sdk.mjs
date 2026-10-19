/** Bind catalog/operational native integration evidence to fresh current-source fixtures. */
import assert from "node:assert/strict";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {sourceEvidence,saveEvidence} from "./candidate-release/evidence.mjs";
import {buildRoomParticipantInventoryFixtures} from "./check-room-participant-inventory-native.mjs";
import {probeCatalogParticipantOperation} from "./probe-catalog-participant-operation.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");if(process.argv.length!==2)throw Error("No arguments expected");
const source=sourceEvidence(root),native=buildRoomParticipantInventoryFixtures({saveReport:false}),acceptance=await probeCatalogParticipantOperation(resolve(root,"target/promoted-shared-web"),native);
assert.equal(acceptance.passed,true);assert.equal(acceptance.receiverChecks,true);assert.deepEqual(sourceEvidence(root),source);
const report={format:"breditor/catalog-participant-operation-sdk-check",formatVersion:1,passed:true,source,native,acceptance};saveEvidence(resolve(root,"target/catalog-participant-operation-sdk.json"),report);console.log(JSON.stringify(report,null,2));
