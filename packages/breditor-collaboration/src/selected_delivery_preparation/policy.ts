/** New bounded preparation namespace; original execution meanings stay unchanged. */
import {fields as dataFields} from '../physical_room_record_cut/policy.js';
import {database as dataDatabase} from '../physical_room_asset_adoption/policy.js';
export function fields(value:unknown,required:readonly string[]):Record<string,unknown>{try{return dataFields(value,required);}catch{throw fail('delivery_preparation_policy');}}
export function database(value:unknown):string{try{return dataDatabase(value);}catch{throw fail('delivery_preparation_policy');}}
export {MAX_SELECTED_ROOM_CURRENT_BYTES as MAX_DELIVERY_PREPARATION_BYTES} from '../selected_room_current/manifest.js';
export class DeliveryPreparationError extends Error{constructor(readonly code:'delivery_preparation_policy'|'delivery_preparation_integrity'|'delivery_preparation_exists'|'delivery_preparation_missing'|'delivery_preparation_busy'|'delivery_preparation_closed'|'delivery_preparation_aborted'|'delivery_preparation_storage'){super('Durably retain the actual complete before-state before recovered delivery');this.name='DeliveryPreparationError';}}
export const fail=(code:DeliveryPreparationError['code']='delivery_preparation_integrity')=>new DeliveryPreparationError(code);
