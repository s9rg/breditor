/** Normal source constructors and the fixed sixty-cohort workload, no shortened domain. */
import assert from 'node:assert/strict';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as Legacy} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {OperationalRestoredLocalParticipant as Snapshot} from '../packages/breditor-collaboration/dist/restored_local_operation/participant.js';
import {OperationalFlatLocalParticipant as Flat} from '../packages/breditor-collaboration/dist/flat_local_operation/participant.js';
import {captureLocalOperationBackup} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {handoffLocalOperationCohort} from '../packages/breditor-collaboration/dist/local_operation_cohort/cohort.js';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {probeLocalOperationCohort} from './probe-local-operation-cohort.mjs';
if(process.argv.length!==2)throw Error('No substituted runtime or reduced workload accepted');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root);
const acceptance=await probeLocalOperationCohort({api,rich,internals:{Legacy,Snapshot,Flat,captureLocalOperationBackup,handoffLocalOperationCohort},runtime:join(root,'target/promoted-shared-web'),fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});
assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/local-operation-cohort-sdk',formatVersion:1,passed:true,source,sourceUnchanged:true,acceptance};saveEvidence(join(root,'target/local-operation-cohort-sdk.json'),report);console.log(JSON.stringify(report));
