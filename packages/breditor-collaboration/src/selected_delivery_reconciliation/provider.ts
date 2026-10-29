/** Actual current provider bytes via the genuine delivery-control private port. */
import {projectSelectedRoomProvider} from '../selected_room_provider/projection.js';
import type {RoomAssetAdoptionRecord} from '../physical_room_asset_adoption/contract.js';
import type {SelectedDeliveryInventory} from './inventory.js';
import {checkSelectedDeliveryInventory} from './inventory.js';
import type {SelectedDeliveryProviderRead} from './contract.js';
import {frozen} from '../room_participant_inventory/policy.js';
export function selectedDeliveryProvider(admission:SelectedDeliveryInventory,record:RoomAssetAdoptionRecord){checkSelectedDeliveryInventory(admission);return projectSelectedRoomProvider(admission.port,record,(cut,scope,pins,provider):SelectedDeliveryProviderRead=>{checkSelectedDeliveryInventory(admission);return frozen(structuredClone({format:'breditor/selected-delivery-provider-read',formatVersion:1,scope:'held-current-native-selected-and-origin-whole-uploads',kind:provider!==null&&!provider.missing.length?'checked':'pending',control:admission.selection,approval:cut.approval.selection,current:cut.root.selection,history:scope.history,uploads:pins,provider}));});}
