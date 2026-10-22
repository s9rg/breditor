import type {
 SharedRoomParticipantInventory,SharedServerLogGenerationParticipantInventory,
 SharedRoomIndependentLocalParticipantSource,SharedRoomIndependentDeliveryParticipantSource,
 SharedServerLogGenerationCohortSource,SharedServerLogGenerationParticipantSource,
} from '@breditor/collaboration';
declare const physical:SharedServerLogGenerationParticipantInventory;
declare const logical:SharedRoomParticipantInventory;
declare const local:SharedRoomIndependentLocalParticipantSource;
declare const delivery:SharedRoomIndependentDeliveryParticipantSource;
physical.checkIndependentSources([local,delivery]);logical.checkIndependentSources([local,delivery]);
const cohort:readonly SharedServerLogGenerationCohortSource[]=[local,delivery];physical.checkSourceCohort(cohort);
// @ts-expect-error The old mixed reader does not acquire new family meanings.
physical.checkMixedSources([local]);
// @ts-expect-error The old source union is still original/generation.
const old:SharedServerLogGenerationParticipantSource=delivery;
// @ts-expect-error Serialized metadata and flags do not implement genuine source classes.
physical.checkIndependentSources([{family:'independent-local',backup:{ready:true},source:{checked:true}}]);
// @ts-expect-error Graph borrows are private operational inputs, not a public fourth/fifth selector.
physical.checkSourceCohort([{family:'restored-graph',backup:delivery.backup,source:delivery.source}]);
// @ts-expect-error No private native read factory is promoted to the package root.
import {RestoredGraphNativeSourceCapture} from '@breditor/collaboration';
// @ts-expect-error No private inventory friend can be called with a data readiness marker.
import {checkOperationalPhysicalInventoryCohort} from '@breditor/collaboration';
void old;
