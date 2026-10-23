/** Read-only references cannot supply writers, uploads, handoff or activation. */
import * as publicRoot from '@breditor/collaboration';
import {captureIndependentOperationReferences,type IndependentOperationReferenceOptions} from '../../../packages/breditor-collaboration/dist/independent_operation/reference_capture.js';
import {captureRestoredGraphReferences} from '../../../packages/breditor-collaboration/dist/restored_graph/reference_capture.js';
declare const options:IndependentOperationReferenceOptions<'document-v1'>;
async function referenceContract(){
 const local=await captureIndependentOperationReferences(options);
 local.check();await local.verify();local.checkCurrent();
 const metadata=local.metadata();const pairs:readonly Readonly<{asset:string;generation:string}>[]=metadata.references;void pairs;
 // @ts-expect-error The detached exact reference set is not mutable.
 metadata.references.push({asset:'different',generation:'different'});
 // @ts-expect-error A read does not transfer source/upload owners.
 local.intoParts();
 // @ts-expect-error No writer or relay activation method exists.
 local.activate();
 local.dispose();
 const graph=await captureRestoredGraphReferences(options);graph.check();await graph.verify();graph.checkCurrent();
 const state=graph.metadata();const scope:'original-input-current-pending-live-native-and-retained-packets'=state.scope;void scope;
 // @ts-expect-error Imported ancestry rows remain read-only.
 state.states.length=0;
 // @ts-expect-error No editing core is exposed.
 graph.core.dispatch({commands:[]});
 graph.dispose();
 // @ts-expect-error This is an opt-in private contract, not a public-root promotion.
 publicRoot.captureIndependentOperationReferences(options);
 // @ts-expect-error This is an opt-in private contract, not a public-root promotion.
 publicRoot.captureRestoredGraphReferences(options);
}
void referenceContract;
