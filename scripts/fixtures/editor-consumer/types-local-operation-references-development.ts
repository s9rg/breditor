/** Local-only retained history reads cannot acquire delivery or write owners. */
import * as publicRoot from '@breditor/collaboration';
import {LocalOperationReferenceCapture,captureLocalOperationReferences,type LocalOperationReferenceOptions} from '../../../packages/breditor-collaboration/dist/independent_local_operation/reference_capture.js';
declare const options:LocalOperationReferenceOptions<'document-v1'>;
async function localReferenceContract(){
 const read=await captureLocalOperationReferences(options);
 read.check();await read.verify();read.checkCurrent();
 const metadata=read.metadata();
 const scope:'original-current-pending-live-local-native-and-versions'=metadata.scope;void scope;
 const pairs:readonly Readonly<{asset:string;generation:string}>[]=metadata.references;void pairs;
 // @ts-expect-error No mutable state escapes.
 metadata.states.length=0;
 // @ts-expect-error No mutable reference list escapes.
 metadata.references.push({asset:'forged',generation:'forged'});
 // @ts-expect-error No native editing owner is exposed.
 read.core.undo();
 // @ts-expect-error Local reads neither fabricate nor transfer a delivery companion.
 read.intoParts();
 // @ts-expect-error A read result cannot activate a room.
 read.activate();
 // @ts-expect-error No current upload store is necessary or accepted.
 await captureLocalOperationReferences({...options,assets:{}});
 // @ts-expect-error A local-only read cannot bind a relay identity.
 await captureLocalOperationReferences({...options,relay:{}});
 // @ts-expect-error The proof constructor remains private.
 new LocalOperationReferenceCapture({},metadata,()=>{},()=>{},async()=>{},()=>{});
 // @ts-expect-error This remains a private development contract, not public-root API.
 publicRoot.captureLocalOperationReferences(options);
 read.dispose();
}
void localReferenceContract;
