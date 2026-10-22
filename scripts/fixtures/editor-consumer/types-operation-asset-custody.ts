/** Temporary cohort leases are internal genuine-owner mechanics, not public adoption DTOs. */
import {OperationalSharedParticipant,OperationalSharedGenerationParticipant} from '@breditor/collaboration';
import {RichAssetStore,RichAssetStoreCustody} from '@breditor/experimental-rich-content';
// @ts-expect-error A public caller cannot manufacture a multi-owner reservation.
import {holdOperationalAssets} from '@breditor/collaboration';
// @ts-expect-error Internal cohort reservations are not public saved readiness proofs.
import type {OperationalCohortReservation} from '@breditor/collaboration';
// @ts-expect-error Leases come from actual stores, never constructors or copied records.
new RichAssetStoreCustody();
declare const original:OperationalSharedParticipant,generation:OperationalSharedGenerationParticipant;
async function use(){for(const owner of [original,generation]){const parts=await owner.intoParts();const upload:RichAssetStore=parts.uploads;upload.checkOpen();}return RichAssetStore.openRetained('explicit-current-store');}
void use;
