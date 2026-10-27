import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import {SharedPersistentSession,type SharedSessionOptions} from '../../../packages/breditor-collaboration/dist/persistence/shared_session.js';
import {StoppedActorCohort} from '../../../packages/breditor-collaboration/dist/persistence/stopped_actor_cohort.js';
import {SharedWriterLease} from '../../../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ActorLeaseEscrow} from '../../../packages/breditor-collaboration/dist/persistence/actor_lease_escrow.js';
import {bindActorLeaseInput,type ActorLeaseFactoryInput} from '../../../packages/breditor-collaboration/dist/persistence/actor_lease_input.js';
type Assert<T extends true>=T;
type Private=Assert<Extract<'StoppedActorCohort'|'ActorLeaseEscrow'|'bindActorLeaseInput'|'takeStoppedSharedSourceActors',keyof typeof Root> extends never?true:false>;
declare const source:SharedPersistentSession,options:SharedSessionOptions,escrow:ActorLeaseEscrow;
const cohort=StoppedActorCohort.take([{id:'member',family:'shared',source}]);
const selected:ActorLeaseFactoryInput<SharedSessionOptions>=cohort.bind('member',options,'selected-target');
void SharedPersistentSession.open(selected.input);
void selected.rollbackAfterFailure();
// @ts-expect-error Runtime admission also rejects directly constructed source leases.
new SharedWriterLease('room','101',()=>{},Promise.resolve(),{});
// @ts-expect-error A caller cannot construct paired actor ownership.
new ActorLeaseEscrow({}, {}, 'room', '101', 'comments', {});
// @ts-expect-error The cohort is constructed only from genuine selected owners.
new StoppedActorCohort({}, []);
// @ts-expect-error A public option never selects private actor custody.
void SharedPersistentSession.open({...options,actorLeaseEscrow:escrow});
// @ts-expect-error Saved failure labels are not factory cleanup or actor custody.
void bindActorLeaseInput(options,'shared','target','room','101',null,{failed:true});
// @ts-expect-error Input rollback is not final whole-root ownership commit.
selected.commit();
// @ts-expect-error Actor resource transfer does not activate authenticated serving.
cohort.activate();
// @ts-expect-error No host-provided decision callback runs inside resource transfer.
void StoppedActorCohort.take([{id:'member',family:'shared',source}],()=>true);
export type {Private};
