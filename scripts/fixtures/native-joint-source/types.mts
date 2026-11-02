/** Private SDK declaration laws. These do not qualify a public production API. */
import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import {NativeActivationSourceSession,withNativeActivationSources} from '../../../packages/breditor-collaboration/dist/native_room_joint_activation/source_session.js';
import type {RetainedSelectedAssetOwner} from '../../../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/history_read_contract.js';
import {prepareSharedWriterLeaseCloseRetention} from '../../../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {takeClosedNativeActorCohort} from '../../../packages/breditor-collaboration/dist/persistence/stopped_actor_cohort.js';
type Assert<T extends true>=T;
type Private=Assert<Extract<'NativeActivationSourceSession'|'withNativeActivationSources'|'prepareSharedWriterLeaseCloseRetention'|'takeClosedNativeActorCohort',keyof typeof Root> extends never?true:false>;
declare const owner:RetainedSelectedAssetOwner,reads:PhysicalOperationV3HistoryReadOptions;
const session=NativeActivationSourceSession.begin(owner,reads);
const ready:Promise<void>=session.ready();
const inspection=withNativeActivationSources(session,async held=>{held.check();return held.sources.length;});
const count:Promise<number>=inspection;
const suspended:Promise<void>=session.suspend();
// @ts-expect-error Saved source state cannot stand in for the genuine owner.
NativeActivationSourceSession.begin({closed:true},reads);
// @ts-expect-error Construction is controlled by actual reservation acquisition.
new NativeActivationSourceSession({},owner,reads);
// @ts-expect-error A copied session cannot execute trusted source composition.
withNativeActivationSources({ready(){return ready;}},async()=>0);
// @ts-expect-error Matching room/writer descriptions cannot mint actor custody.
prepareSharedWriterLeaseCloseRetention({room:'room',writer:'101',closed:true},'room','101');
// @ts-expect-error Only the actual complete close-retention cohort can transfer.
takeClosedNativeActorCohort({members:[],closed:true});
// @ts-expect-error A source suspension is not a server activation permission.
session.activate();
void count;void suspended;
export type {Private};
