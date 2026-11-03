/** Internal custody is explicit; public document-version contracts stay unchanged. */
import * as publicApi from '@breditor/collaboration';
import {createNativeVersionDelivery,type NativeVersionDelivery,type NativeVersionDeliveryOptions} from '../../../packages/breditor-collaboration/dist/versions/native_delivery.js';
import type {NativeRelayDelivery} from '../../../packages/breditor-collaboration/dist/relay/native_delivery.js';
declare const catalog:publicApi.SharedDocumentVersions,context:NativeRelayDelivery;
const options:NativeVersionDeliveryOptions={getToken:async()=>'current token',flushDocument:async()=>{},requestTimeoutMs:5000};
const delivery:NativeVersionDelivery=createNativeVersionDelivery(catalog,context,options);
const state:publicApi.SharedDocumentVersionsState=delivery.state();const packet:Promise<string>=delivery.loadVersion('original version id');
const materialized:Promise<string>=delivery.materializeVersion('sha256:known-original-entry');
const saved:Promise<void>=delivery.retryLocal();const drained:Promise<void>=delivery.close();
// @ts-expect-error Identity is the original catalog binding, never selected by this delivery call.
createNativeVersionDelivery(catalog,context,{...options,identity:{}});
// @ts-expect-error Delivery cannot swap the actual original store or source.
createNativeVersionDelivery(catalog,context,{...options,storage:{}});
// @ts-expect-error Actual constructor bindings retain the original database.
createNativeVersionDelivery(catalog,context,{...options,database:'replacement'});
// @ts-expect-error A fresh explicit call, not an automatic background grant.
createNativeVersionDelivery(catalog,context,{...options,autoConnect:true});
// @ts-expect-error The narrow delivery controller cannot create or replace a version packet.
delivery.saveVersion('new version','1');
// @ts-expect-error No ordinary editor unlock or native recovery release is exposed.
delivery.release();
// @ts-expect-error The public package root does not issue private recovery authority.
publicApi.createNativeVersionDelivery(catalog,context,options);
void state;void packet;void materialized;void saved;void drained;
