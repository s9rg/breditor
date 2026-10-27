import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import {NativeActorRetirement,takeNativeActorCohort,type NativeActorClient} from '../../../packages/breditor-collaboration/dist/persistence/native_actor_cohort.js';
import {StoppedActorCohort} from '../../../packages/breditor-collaboration/dist/persistence/stopped_actor_cohort.js';
type Assert<T extends true>=T;
type Private=Assert<Extract<'NativeActorRetirement'|'takeNativeActorCohort'|'nativeActorSource',keyof typeof Root> extends never?true:false>;
declare const clients:readonly NativeActorClient[];
const ready=NativeActorRetirement.prepare(clients);ready.checkBeforeRetirement();
const actors:StoppedActorCohort=ready.takeAfterRetirement();
void takeNativeActorCohort(clients);void actors.close();
// @ts-expect-error Readiness must be obtained from genuine registered sources.
new NativeActorRetirement({},clients);
// @ts-expect-error Readiness is not actor custody or mutable factory selection.
ready.bind('member',{},'target');
// @ts-expect-error Resource readiness cannot grant authenticated serving authority.
ready.activate();
// @ts-expect-error No host callbacks run during whole-source admission/transfer.
NativeActorRetirement.prepare(clients,()=>true);
export type {Private};
