import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import {ColdRoomRecoveryAttempt} from '../../../packages/breditor-collaboration/dist/cold_room_recovery/attempt.js';
import type {ColdRoomRecoveryOptions} from '../../../packages/breditor-collaboration/dist/cold_room_recovery/contract.js';
import type {RetainedSelectedAssetOwner} from '../../../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
type Assert<T extends true>=T;type Private=Assert<Extract<'ColdRoomRecoveryAttempt'|'resumeColdSelectedRoomWithActors'|'snapshotPhysicalRootResumeOptions',keyof typeof Root> extends never?true:false>;
declare const options:ColdRoomRecoveryOptions;const attempt=ColdRoomRecoveryAttempt.begin(options);await attempt.open();const preview=await attempt.preview();const result=await attempt.promote({expected:preview.choice,approve:()=>true,checkAssetAuthority(){}});const owner:RetainedSelectedAssetOwner=attempt.takeOwner();void owner.clients;await attempt.close();
// @ts-expect-error The complete data result does not grant mutable clients.
result.clients;
// @ts-expect-error Every attempt needs an independently selected complete basis.
ColdRoomRecoveryAttempt.begin({root:options.root,reads:options.reads,intentDatabase:options.intentDatabase});
// @ts-expect-error A persisted approval cannot replace a new decision.
attempt.promote({expected:preview.choice,checkAssetAuthority(){}});
// @ts-expect-error Asset authority has a lifetime independent of the finite job.
attempt.promote({expected:preview.choice,approve:()=>true});
// @ts-expect-error No original live source or ready cohort is accepted as cold data.
ColdRoomRecoveryAttempt.begin({...options,actors:{ready:true}});
// @ts-expect-error Recovered local native ownership does not activate a server.
owner.activate();
export type {Private};
