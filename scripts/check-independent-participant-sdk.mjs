/** Frozen-source functional independent participant recovery, using the normal native runtime. */
import assert from 'node:assert/strict';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {probeIndependentParticipant} from './probe-independent-participant.mjs';
import {sourceEvidence,fileEvidence,saveEvidence} from './candidate-release/evidence.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');if(process.argv.length!==2)throw Error('No substituted runtime or fixture arguments accepted');
const source=sourceEvidence(root),fixture='crates/breditor-core/tests/fixtures/rich-local-root.json',acceptance=await probeIndependentParticipant({api,rich,runtime:resolve(root,'target/promoted-shared-web'),fixture:resolve(root,fixture)});assert.equal(acceptance.passed,true);assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/independent-participant-sdk-check',formatVersion:1,passed:true,source,fixture:fileEvidence(root,fixture),acceptance};saveEvidence(resolve(root,'target/independent-participant-sdk.json'),report);console.log(JSON.stringify(report,null,2));
