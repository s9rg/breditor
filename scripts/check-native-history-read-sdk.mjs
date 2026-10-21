/** Checked source native-history implementation, without alternate runtime arguments. */
import assert from 'node:assert/strict';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as historyReads from '../packages/breditor-collaboration/dist/native_history_read/registry.js';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {probeNativeHistoryRead} from './probe-native-history-read.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');if(process.argv.length!==2)throw Error('No substituted source or runtime arguments accepted');
const source=sourceEvidence(root),acceptance=await probeNativeHistoryRead({api,historyReads,runtime:resolve(root,'target/promoted-shared-web')});assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/captured-native-history-sdk-check',formatVersion:1,passed:true,source,sourceUnchanged:true,acceptance};saveEvidence(resolve(root,'target/native-history-read-sdk.json'),report);console.log(JSON.stringify(report,null,2));
