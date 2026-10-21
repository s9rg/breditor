/** Frozen-source actual-Wasm cleanup qualification; no substituted native module or fixture data. */
import assert from 'node:assert/strict';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {probeOwnedCoreCleanup} from './probe-owned-core-cleanup.mjs';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');if(process.argv.length!==2)throw Error('No substituted native runtime or fixtures accepted');
const source=sourceEvidence(root),acceptance=await probeOwnedCoreCleanup({api,runtime:resolve(root,'target/promoted-shared-web')});assert.equal(acceptance.passed,true);assert.deepEqual(sourceEvidence(root),source);const report={format:'breditor/owned-core-cleanup-sdk-check',formatVersion:1,passed:true,source,sourceUnchanged:true,acceptance};saveEvidence(resolve(root,'target/owned-core-cleanup-sdk.json'),report);console.log(JSON.stringify(report,null,2));
