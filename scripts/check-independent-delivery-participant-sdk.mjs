/** Source-frozen native, portable-byte and authenticated network proof; never builds/publishes. */
import assert from 'node:assert/strict';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {independentDeliveryParticipantAcceptance} from './independent-delivery-participant-acceptance.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),args=process.argv.slice(2);if(args.length!==2)throw Error('Expected explicitly built isolated relay and revision native hosts');
const acceptance=await independentDeliveryParticipantAcceptance({api,rich,runtime:resolve(root,'target/promoted-shared-web'),fixture:resolve(root,'crates/breditor-core/tests/fixtures/rich-local-root.json'),sdkModule:new URL('../packages/breditor-collaboration/dist/index.js',import.meta.url),relayHost:resolve(args[0]),revisionHost:resolve(args[1])});assert.deepEqual(sourceEvidence(root),source);const report={format:'breditor/independent-delivery-participant-sdk-qualification',passed:true,source,sourceUnchanged:true,acceptance};saveEvidence(resolve(root,'target/independent-delivery-participant-sdk.json'),report);console.log(JSON.stringify(report,null,2));
