/** Fixed ordinary runtime; source input cannot select an alternate Wasm or a
 * reduced workload. The source and installed probes execute identical bytes. */
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import * as old from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import * as capture from '../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import * as snapshot from '../packages/breditor-collaboration/dist/restored_local_operation/participant.js';
import * as flat from '../packages/breditor-collaboration/dist/flat_local_operation/participant.js';
import * as incoming from '../packages/breditor-collaboration/dist/native_input_operation/incoming_source.js';
import * as snapshotArchive from '../packages/breditor-collaboration/dist/independent_local_operation/portable_backup.js';
import * as flatArchive from '../packages/breditor-collaboration/dist/flat_local_operation/archive.js';
import {checkCapturedNativeHistoryRead} from '../packages/breditor-collaboration/dist/native_history_read/registry.js';
import {probeNativeInputIncomingSource} from './probe-native-input-incoming-source.mjs';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
if(process.argv.length!==2)throw Error('No substituted runtime, assertions or reduced workload accepted');
const root=process.cwd(),source=sourceEvidence(root),acceptance=await probeNativeInputIncomingSource({api,rich,internals:{...old,...capture,...snapshot,...flat,...snapshotArchive,...flatArchive,checkCapturedNativeHistoryRead,captureNativeInputIncomingSource:incoming.nativeInputIncomingSource.capture,readNativeInputIncomingSource:incoming.nativeInputIncomingSource.read,disposeNativeInputIncomingSource:incoming.nativeInputIncomingSource.dispose},runtime:resolve(root,'target/promoted-shared-web'),fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});
assert.equal(acceptance.passed,true);assert.equal(acceptance.cases,40);assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/native-input-incoming-source-sdk-check',formatVersion:1,passed:true,source,sourceUnchanged:true,acceptance};saveEvidence(resolve(root,'target/native-input-incoming-source-sdk.json'),report);console.log(JSON.stringify(report,null,2));
