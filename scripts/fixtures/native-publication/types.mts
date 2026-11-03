/** Installed-consumer surface: descriptions, actual requester and receipt
 * association stay distinct; no local editor readiness method exists. */
import {SharedNativeRoomPublicationHost as Host,nativePublicationHostPort} from '../../../packages/breditor-collaboration/dist/native_publication_control/host.js';
import type {SharedNativeRoomPublicationSelection,SharedNativeRoomPublicationBinding,SharedNativeRoomPublicationHostOptions,SharedNativeRoomPublicationReceipt} from '../../../packages/breditor-collaboration/dist/native_publication_control/contract.js';
declare const expected:SharedNativeRoomPublicationSelection,joint:SharedNativeRoomPublicationBinding;
const options:SharedNativeRoomPublicationHostOptions={endpoint:'https://example.test/recovery/native-publication/v1/publish',expected,principal:'operator',getToken:async(signal:AbortSignal)=>{signal.throwIfAborted();return 'token';},checkAuthority:()=>{}};
const host=Host.configure(options),selected:SharedNativeRoomPublicationSelection=host.selection(),receipt:Promise<SharedNativeRoomPublicationReceipt>=host.publish(joint),held:Promise<SharedNativeRoomPublicationReceipt>=nativePublicationHostPort(host).publish(joint,()=>{},new AbortController().signal);
void selected;void receipt;void held;host.close();
// @ts-expect-error A receipt is association DATA and cannot certify an editor.
void receipt.then(value=>value.takeOwner());
// @ts-expect-error Actual SDK requester state cannot be structurally copied.
const copied:Host={selection:()=>expected,publish:()=>receipt,close(){}};
void copied;
