/** SDK-private ingress remains separate from the ordinary public root. */
import * as publicApi from '@breditor/collaboration';
import type {NativeRecoveryReservation} from '../../../packages/breditor-collaboration/dist/native_recovery/contract.js';
import {nativeRecoveryAdoptSuggestionHistory} from '../../../packages/breditor-collaboration/dist/native_recovery/work_admission.js';
import type {NativeRelayDeliveryPort} from '../../../packages/breditor-collaboration/dist/relay/native_delivery.js';
import type {SharedOwnedSuggestionAcceptance} from '../../../packages/breditor-collaboration/dist/reviewed_history_types.js';
declare const held:NativeRecoveryReservation,core:publicApi.SharedRichEditor,proof:publicApi.SharedDocumentSuggestionEffectProof,port:NativeRelayDeliveryPort,acceptance:SharedOwnedSuggestionAcceptance;
const changed:boolean=nativeRecoveryAdoptSuggestionHistory(held,core,proof,'exact original packet',acceptance);
const same:boolean=port.adoptSuggestionHistory(proof,'exact original packet',acceptance);
// @ts-expect-error A serialized summary cannot substitute for the actual native proof.
port.adoptSuggestionHistory(proof.summary(),'packet',acceptance);
// @ts-expect-error The normal public API does not issue native recovery ingress.
publicApi.nativeRecoveryAdoptSuggestionHistory(held,core,proof,'packet',acceptance);
// @ts-expect-error A packet is not a held native reservation.
nativeRecoveryAdoptSuggestionHistory('packet',core,proof,'packet',acceptance);
void changed;void same;
