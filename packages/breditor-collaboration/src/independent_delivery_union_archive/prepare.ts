/** Persist both full originals and the replayable result before any separate source/asset restoration. */
import{recoveryOpeningContext}from'../participant_recovery/opening_custody.js';
import{archiveBlob}from'../archive_integrity/policy.js';
import{unionArchiveChoice}from'./plan.js';
import{DeliveryUnionArchiveScope as Scope}from'./scope.js';
import{DeliveryUnionResources}from'./resources.js';
import type{SharedIndependentDeliveryUnionArchiveChoice as Choice,SharedIndependentDeliveryUnionArchiveFile as File,SharedIndependentDeliveryUnionArchiveReadOptions as Read}from'./contract.js';
import{fields,fail,MAX_INDEPENDENT_DELIVERY_UNION_ARCHIVE_BYTES as max}from'./policy.js';
function context(){return{factory:recoveryOpeningContext(),locks:globalThis.navigator.locks};}
async function open(provided:Choice,options:Read,pinned:ReturnType<typeof context>,initial?:Blob):Promise<File>{const expected=unionArchiveChoice(provided),scope=new Scope(options);let resources:DeliveryUnionResources|undefined;try{if(globalThis.indexedDB!==pinned.factory||globalThis.navigator?.locks!==pinned.locks)throw fail('delivery_union_closed');resources=new DeliveryUnionResources();scope.check();const value=await resources.open(expected,{wasm:scope.integrity.wasm,session:scope.session,authorizations:scope.authorizations,limits:scope.limits,checkAuthority:scope.check,signal:scope.signal},initial);scope.check();return value;}finally{try{await resources?.close();}finally{scope.close();}}}
/** One immutable absent-only journal. Target namespaces and actors remain untouched. */
export function prepareSharedIndependentDeliveryUnion(provided:File,options:Read):Promise<File>{const pinned=context(),row=fields(provided,['choice','file']);return open(unionArchiveChoice(row['choice']),options,pinned,archiveBlob(row['file'] as Blob,max));}
/** Existing-only reopen freshly replays every native/store and asset decision. Missing DB creation aborts. */
export function readPreparedSharedIndependentDeliveryUnion(expected:Choice,options:Read):Promise<File>{const pinned=context();return open(expected,options,pinned);}
