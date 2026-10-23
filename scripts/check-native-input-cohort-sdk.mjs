/** Actual source constructors and the fixed full multi-owner workload. */
import assert from 'node:assert/strict';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as OldParent} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {OperationalRestoredLocalParticipant as Snapshot} from '../packages/breditor-collaboration/dist/restored_local_operation/participant.js';
import {OperationalFlatLocalParticipant as Flat} from '../packages/breditor-collaboration/dist/flat_local_operation/participant.js';
import {captureLocalOperationBackup} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {handoffNativeInputParticipants} from '../packages/breditor-collaboration/dist/native_input_operation/cohort.js';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {probeNativeInputCohort} from './probe-native-input-cohort.mjs';
if(process.argv.length!==2)throw Error('No substituted runtime or reduced workload accepted');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root);
const acceptance=await probeNativeInputCohort({api,rich,internals:{OldParent,Snapshot,Flat,captureLocalOperationBackup,handoffNativeInputParticipants},runtime:join(root,'target/promoted-shared-web'),fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});
assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/native-input-cohort-sdk',formatVersion:1,passed:true,source,sourceUnchanged:true,acceptance};saveEvidence(join(root,'target/native-input-cohort-sdk.json'),report);console.log(JSON.stringify(report));
