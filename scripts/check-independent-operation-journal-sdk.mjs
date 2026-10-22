/** Fixed normal-runtime full journal matrix; never substitutes a smoke module or fewer policies. */
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import * as journal from '../packages/breditor-collaboration/dist/independent_operation/cut_journal.js';
import * as sourceOpen from '../packages/breditor-collaboration/dist/independent_operation/open_journaled_source.js';
import * as preparation from '../packages/breditor-collaboration/dist/independent_delivery_recovery/prepare.js';
import {probeIndependentOperationJournal} from './probe-independent-operation-journal.mjs';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
const root=process.cwd(),source=sourceEvidence(root);if(process.argv.length!==2)throw Error('No substituted journal inputs accepted');
const acceptance=await probeIndependentOperationJournal({api,rich,internals:{...journal,...sourceOpen,...preparation},runtime:resolve(root,'target/promoted-shared-web'),fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});assert.equal(acceptance.passed,true);assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/independent-operation-journal-sdk-check',passed:true,source,sourceUnchanged:true,acceptance};saveEvidence(resolve(root,'target/independent-operation-journal-sdk.json'),report);console.log(JSON.stringify(report,null,2));
