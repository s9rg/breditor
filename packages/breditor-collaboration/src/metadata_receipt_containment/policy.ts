/** Refuse a bounded comparison rather than silently returning partial containment. */
import {LocalMetadataAssetError} from '../selected_local_metadata_assets/error.js';
export const MAX_ORIGINAL_RECEIPT_REQUIREMENTS=100000;
export const fail=(code='metadata_receipt_source')=>new LocalMetadataAssetError(code);
export function object(input:unknown):Record<string,unknown>{if(!input||typeof input!=='object'||Array.isArray(input))throw fail();return input as Record<string,unknown>;}
export function text(input:unknown):string{if(typeof input!=='string')throw fail();return input;}
export const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
