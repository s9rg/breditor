import {captureSelectedServerMetadata} from '@breditor/collaboration';
import {SelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import type {LocalMetadataReconciliationRead} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_assets/reconciliation_contract.js';
import type {LocalMetadataReceiptContainmentInput,LocalMetadataReceiptContainmentRead,OriginalReceiptKind} from '@breditor/collaboration';
declare const owner:SelectedLocalMetadataDelivery,input:LocalMetadataReceiptContainmentInput,report:LocalMetadataReceiptContainmentRead;
void owner.captureReceiptContainment(input).then(value=>{
 const scope:'same-held-native-original-local-receipts-in-current-server-catalogs'=value.scope;void scope;
 const kind:'contained'|'pending'=value.kind;void kind;
 const original:LocalMetadataReconciliationRead=value.reconciliation;void original;
 for(const item of value.pending){const receipt:OriginalReceiptKind=item.receipt;const relation:'missing'|'different'|'server-behind'=item.relation;void receipt;void relation;}
 // @ts-expect-error Containment data cannot activate or grant a Native writer.
 value.activate();
 // @ts-expect-error The earlier checked result is nested under its original name.
 const checked:'checked'=value.kind;void checked;
 // @ts-expect-error Original receipt diagnostics are immutable.
 value.pending.push({});
});
void captureSelectedServerMetadata(input.host,{versions:{kind:'start'},suggestions:{kind:'start'},revisions:{kind:'start'}});
void input.host.readMetadata({versions:{kind:'start'},suggestions:{kind:'start'},revisions:{kind:'start'}});
// @ts-expect-error A saved selection is data, not a live controller.
void owner.captureReceiptContainment({...input,host:report.catalog.selection});
// @ts-expect-error Original server permissions do not grant client activation.
report.catalog.createDelivery();
// @ts-expect-error A chosen packet matcher or Native runtime is not injectable.
void owner.captureReceiptContainment({...input,wasm:{}});
