/** Fresh synchronous host policy and host-context pinning, never archived permission. */
import type {RichAssetRestoreOptions} from './types.js';
import {RichAssetBackupError,checkAssetBackupSignal} from './error.js';
export interface RichAssetHeldRestoreOptions extends RichAssetRestoreOptions {checkAuthority:()=>void}
export function heldAssetRestorePolicy(input:RichAssetHeldRestoreOptions){
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['uploadState','signal','limits','onChange','checkAuthority'].includes(k)))throw new RichAssetBackupError('asset_backup_policy','Select explicit held restore inputs');
 const selected={...input},authority=selected.checkAuthority,context=globalThis.indexedDB,locks=globalThis.navigator?.locks;
 if(selected.uploadState!=='preserve'||typeof authority!=='function'||!context||!locks?.request)throw new RichAssetBackupError('asset_backup_policy','Held restore requires current authority, explicit preservation and Web Locks');
 const current=()=>{if(globalThis.indexedDB!==context||globalThis.navigator?.locks!==locks)throw new RichAssetBackupError('asset_backup_policy','Held restore storage host changed');checkAssetBackupSignal(selected.signal);};
 const check=()=>{current();const result:unknown=Reflect.apply(authority,undefined,[]);if(result&&(typeof result==='object'||typeof result==='function')&&typeof(result as {then?:unknown}).then==='function'){void Promise.resolve(result).catch(()=>{});throw new RichAssetBackupError('asset_backup_policy','Held restore authority must complete synchronously');}current();};
 check();return{selected,check};
}
