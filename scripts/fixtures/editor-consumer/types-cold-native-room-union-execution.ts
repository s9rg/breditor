import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import {ColdNativeRoomUnionExecutionAttempt as Cold} from '../../../packages/breditor-collaboration/dist/cold_native_room_union_execution/attempt.js';
import type {ColdNativeRoomUnionExecutionOptions as Options} from '../../../packages/breditor-collaboration/dist/cold_native_room_union_execution/contract.js';
type Assert<T extends true>=T;type Private=Assert<Extract<'ColdNativeRoomUnionExecutionAttempt',keyof typeof Root> extends never?true:false>;
declare const options:Options;const cold=Cold.resume(options),preview=await cold.preview();await cold.run({expected:preview.choice,approve:()=>true});await cold.repairOriginal(choice=>choice.scope==='repair-existing-original-only');const expected=await cold.previewPromotion();await cold.promote({expected,approve:()=>true,checkAssetAuthority(){}});await cold.complete();cold.takeOwner();await cold.close();
// @ts-expect-error A previous owner is not cold-process actor acquisition.
Cold.resume({...options,owner:{}});
// @ts-expect-error Every destination has a fresh executable host policy.
Cold.resume({...options,run:{expected:options.run.expected}});
// @ts-expect-error New cold identity never grants serving.
cold.activate();
export type {Private};
