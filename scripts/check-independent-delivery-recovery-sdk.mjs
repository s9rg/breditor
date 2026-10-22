/** Full source acceptance; no substituted runtime, native hosts or compact smoke matrix. */
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {independentDeliveryRecoveryAcceptance} from './independent-delivery-recovery-acceptance.mjs';
import {sourceEvidence,fileEvidence,saveEvidence} from './candidate-release/evidence.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),source=sourceEvidence(root),args=process.argv.slice(2);if(args.length!==2)throw Error('Expected both isolated native functional hosts');const hosts=args.map(path=>fileEvidence(root,resolve(path).slice(root.length+1)));
const acceptance=await independentDeliveryRecoveryAcceptance({api,rich,runtime:resolve(root,'target/promoted-shared-web'),fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),sdkModule:new URL('../packages/breditor-collaboration/dist/index.js',import.meta.url),relayHost:resolve(args[0]),revisionHost:resolve(args[1])});
assert.equal(acceptance.passed,true);assert.deepEqual(sourceEvidence(root),source);for(const before of hosts)assert.deepEqual(fileEvidence(root,before.path),before);const report={format:'breditor/independent-delivery-recovery-sdk-check',passed:true,source,sourceUnchanged:true,nativeHosts:hosts,acceptance};saveEvidence(resolve(root,'target/independent-delivery-recovery-sdk.json'),report);console.log(JSON.stringify(report,null,2));
