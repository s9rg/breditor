import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import {StoppedActorCohort} from '../../../packages/breditor-collaboration/dist/persistence/stopped_actor_cohort.js';
import {DeferredActorLeaseInput} from '../../../packages/breditor-collaboration/dist/persistence/deferred_actor_input.js';
import {beginPhysicalRootKeepingActors,resumePhysicalRootKeepingActors} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
import type {PhysicalOperationV3BeginOptions,PhysicalOperationV3ResumeOptions} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/contract.js';
type Assert<T extends true>=T;
type Private=Assert<Extract<'DeferredActorLeaseInput'|'beginPhysicalRootKeepingActors'|'resumePhysicalRootKeepingActors'|'checkCapturedNativeActorRoute',keyof typeof Root> extends never?true:false>;
declare const actors:StoppedActorCohort,begin:PhysicalOperationV3BeginOptions,resume:PhysicalOperationV3ResumeOptions;
const route:DeferredActorLeaseInput=actors.route('member',{databases:['stage','final'],finalDatabase:'final'});
route.select({});void route.close();void beginPhysicalRootKeepingActors(begin,actors);void resumePhysicalRootKeepingActors(resume,actors);
// @ts-expect-error Stored fields never provide actual stopped writer custody.
beginPhysicalRootKeepingActors(begin,{state:'held'});
// @ts-expect-error Explicit held-actor routes cannot fall back to reacquisition.
beginPhysicalRootKeepingActors(begin);
// @ts-expect-error A caller cannot construct a genuine private route owner.
new DeferredActorLeaseInput();
// @ts-expect-error Target routes require an explicit final namespace.
actors.route('member',{databases:['stage','final']});
// @ts-expect-error Actual writer handles do not escape the cohort.
actors.custody();
// @ts-expect-error A native target route is not a server activation grant.
route.activate();
export type {Private};
