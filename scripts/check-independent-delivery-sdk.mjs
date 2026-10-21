/** Source-frozen native and authenticated network qualification; never builds or publishes. */
import assert from 'node:assert/strict';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {independentDeliveryAcceptance} from './independent-delivery-acceptance.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),args=process.argv.slice(2);
if(args.length!==2)throw Error('Expected explicitly built isolated relay and revision native hosts');
const acceptance=await independentDeliveryAcceptance({api,sdkModule:new URL('../packages/breditor-collaboration/dist/index.js',import.meta.url),runtime:resolve(root,'target/promoted-shared-web'),relayHost:resolve(args[0]),revisionHost:resolve(args[1])});
assert.deepEqual(sourceEvidence(root),source);const report={format:'breditor/independent-delivery-sdk-qualification',passed:true,source,sourceUnchanged:true,acceptance};saveEvidence(resolve(root,'target/independent-delivery-sdk.json'),report);console.log(JSON.stringify(report,null,2));
