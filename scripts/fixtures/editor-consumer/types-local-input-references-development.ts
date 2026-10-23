/** Closed source identity selects local snapshot/flat reference reads. */
import * as publicRoot from '@breditor/collaboration';
import {LocalInputReferenceCapture,captureLocalInputOperationReferences,type LocalInputReferenceOptions} from '../../../packages/breditor-collaboration/dist/native_input_operation/reference_capture.js';
declare const options:LocalInputReferenceOptions<'document-v1'>;
async function localInputReferenceContract(){
 const read=await captureLocalInputOperationReferences(options);read.check();await read.verify();read.checkCurrent();
 const metadata=read.metadata(),kind:'snapshot-v1'|'flat-local-v1'=metadata.inputKind;void kind;
 const scope:'input-all-retained-states-current-pending-live-local-native-and-versions'=metadata.scope;void scope;
 // @ts-expect-error No mutable retained states escape.
 metadata.states.push({});
 // @ts-expect-error Input bindings are detached immutable data.
 metadata.inputBindings[0].asset='forged';
 // @ts-expect-error A caller cannot select a family via a format option.
 await captureLocalInputOperationReferences({...options,kind:'flat-local-v1'});
 // @ts-expect-error Discovery does not accept current uploads or later byte resolvers.
 await captureLocalInputOperationReferences({...options,assets:{},resolveAsset(){}});
 // @ts-expect-error No editing owner is exposed.
 read.core.undo();
 // @ts-expect-error No owner transfer is part of the read lifetime.
 read.intoParts();
 // @ts-expect-error Input manifests are not activation grants.
 read.activate();
 // @ts-expect-error A DTO cannot construct a proof.
 new LocalInputReferenceCapture({},metadata,()=>{},()=>{},async()=>{},()=>{});
 // @ts-expect-error This remains an opt-in private development contract.
 publicRoot.captureLocalInputOperationReferences(options);
 read.dispose();
}
void localInputReferenceContract;
