import type*as Root from'../../../packages/breditor-collaboration/dist/index.js';
import{retireNativeRoomUnionKeepingActors,retireReservedNativeRoomUnionKeepingActors}from'../../../packages/breditor-collaboration/dist/native_room_union/retirement.js';
import{withNativeRoomUnionPrepared}from'../../../packages/breditor-collaboration/dist/native_room_union/prepared_scope.js';
type Assert<T extends true>=T;type Private=Assert<Extract<'retireNativeRoomUnionKeepingActors'|'retireReservedNativeRoomUnionKeepingActors'|'withNativeRoomUnionPrepared',keyof typeof Root>extends never?true:false>;
declare const owner:Parameters<typeof retireNativeRoomUnionKeepingActors>[0],read:Parameters<typeof retireNativeRoomUnionKeepingActors>[1],options:Parameters<typeof retireNativeRoomUnionKeepingActors>[2],reservation:Parameters<typeof retireReservedNativeRoomUnionKeepingActors>[1];
retireNativeRoomUnionKeepingActors(owner,read,options).then(result=>{
 const state:'old-writers-closed'=result.state;void state;
 // @ts-expect-error The report is DATA, not author custody.
 result.actors.commit();
 // @ts-expect-error Local writer retirement never activates a server.
 result.activate();
});
retireReservedNativeRoomUnionKeepingActors(owner,reservation,read,options);
// @ts-expect-error Fresh original-role windows are mandatory.
retireNativeRoomUnionKeepingActors(owner,read,{expected:options.expected,retained:options.retained,approve:()=>true});
// @ts-expect-error A saved choice isn't an affirmative executable decision.
retireNativeRoomUnionKeepingActors(owner,read,{...options,approve:true});
// @ts-expect-error Old exact-preparation formats cannot masquerade as this union proof.
retireNativeRoomUnionKeepingActors(owner,read,{...options,expected:{...options.expected,format:'breditor/native-room-preparation-choice'}});
// @ts-expect-error A saved object isn't a genuine original-owner reservation.
retireReservedNativeRoomUnionKeepingActors(owner,{},read,options);
void withNativeRoomUnionPrepared;
export type{Private};
