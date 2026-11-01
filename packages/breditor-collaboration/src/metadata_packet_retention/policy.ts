/** Storage bounds refuse rather than dropping original packets or occurrences. */
import {LocalMetadataAssetError} from '../selected_local_metadata_assets/error.js';
export const fail=(code='metadata_packet_retention_state')=>new LocalMetadataAssetError(code);
export const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export const textBytes=(text:string)=>new TextEncoder().encode(text).length;
