/** SDK-private pointers donated by the genuine stage in the common root/stage
 * barrier. None of these interfaces is an incoming owner-admission contract. */
import type {RichAssetStore,RichAssetStoreCustody} from '@breditor/experimental-rich-content';
import type {RecoveryLease} from '../participant_recovery/lease.js';
import type {RoomAssetAdoptionStore,AdoptionFiles} from '../physical_room_asset_adoption/storage.js';
export interface SelectedAssetTarget{readonly store:RichAssetStore;readonly custody:RichAssetStoreCustody}
export interface SelectedAssetResources{
 store?:RoomAssetAdoptionStore;lease?:RecoveryLease;
 intent?:Readonly<{checkReadCurrent():void;verifyFresh(check:()=>void,signal?:AbortSignal):Promise<void>;close():Promise<void>}>;intentLease?:RecoveryLease;
 readonly targets:Map<string,SelectedAssetTarget>;
 readonly targetLeases:Map<string,RecoveryLease>;
}
export interface SelectedAssetBasis{readonly files:AdoptionFiles;readonly resources:SelectedAssetResources;readonly current:()=>void;readonly currentUploads?:ReadonlyMap<string,Blob>}
