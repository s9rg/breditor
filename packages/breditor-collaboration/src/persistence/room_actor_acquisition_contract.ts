/** SDK-private fresh local resource acquisition. These identities are DATA,
 * not prior retirement, native admission, a saved acknowledgement or activation. */
export type RoomActorAcquisitionMember=Readonly<{id:string;writer:string}>&(
 Readonly<{factory:'shared';actor:null}>|
 Readonly<{factory:'review'|'independent'|'continued-delivery';actor:string}>|
 Readonly<{factory:'segmented';actor:string|null}>);
export interface RoomActorAcquisitionOptions{
 readonly room:string;readonly members:readonly RoomActorAcquisitionMember[];
 readonly checkAuthority:()=>void;readonly signal?:AbortSignal;
}
