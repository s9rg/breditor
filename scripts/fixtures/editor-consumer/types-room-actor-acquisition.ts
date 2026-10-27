import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import {RoomActorAcquisition} from '../../../packages/breditor-collaboration/dist/persistence/room_actor_acquisition.js';
import type {RoomActorAcquisitionOptions} from '../../../packages/breditor-collaboration/dist/persistence/room_actor_acquisition_contract.js';
import {takeAcquiredActorCohort} from '../../../packages/breditor-collaboration/dist/persistence/stopped_actor_cohort.js';
type Assert<T extends true>=T;type Private=Assert<Extract<'RoomActorAcquisition'|'takeAcquiredActorCohort'|'prepareAcquiredRoomActors',keyof typeof Root> extends never?true:false>;
declare const options:RoomActorAcquisitionOptions;const acquisition=RoomActorAcquisition.begin(options);await acquisition.acquire();void acquisition.bindings();const cohort=takeAcquiredActorCohort(acquisition);void cohort.bindings();await cohort.close();await acquisition.close();
// @ts-expect-error Only the canonical synchronous factory constructs custody.
new RoomActorAcquisition(options);
// @ts-expect-error A ready report is not the genuine private actor owner.
takeAcquiredActorCohort({ready:true,members:options.members});
// @ts-expect-error An actor with no comment lane cannot use an independent factory.
const wrong:RoomActorAcquisitionOptions={room:'room',members:[{id:'a',factory:'independent',writer:'1',actor:null}],checkAuthority(){}};
// @ts-expect-error Actor acquisition is not authenticated room activation.
acquisition.activate();
export type {Private};void wrong;
