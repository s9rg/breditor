/** Original outbox custody. This registry lends no new queue, source, packet
 * capture or authority, and never reserves the already-held queue a second time. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedRichEditor} from '../core.js';
import type {SharedSuggestionRevisionInfo} from '../suggestion_types.js';
import type {SharedSuggestionQueue} from '../suggestions/queue.js';
import type {SharedSuggestionQueueIdentity} from '../suggestions/types.js';
import type {NativeSuggestionChild} from '../suggestions/native_child.js';
import type {SharedSuggestionRevisions} from './outbox.js';
import type {SharedSuggestionRevisionsRecord,SharedSuggestionRevisionRow} from './types.js';
import {nativeRelayDeliveryForSource} from '../relay/native_delivery.js';
import {nativeSuggestionQueueView} from '../suggestions/native_queue.js';
import {SharedRelayError} from '../relay/validation.js';
export type NativeRevisionSettlement=Pick<SharedSuggestionRevisionRow,'retry'|'receipt'|'conflict'>;
export interface NativeRevisionStore<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly core:SharedRichEditor<P>;readonly identity:SharedSuggestionQueueIdentity;readonly binding:string;
 record():SharedSuggestionRevisionsRecord;infos():readonly SharedSuggestionRevisionInfo[];row(id:string):SharedSuggestionRevisionRow;
 state():{pending:boolean;failed:boolean;localSaved:boolean};subscribe(listener:()=>void):()=>void;
 settle(id:string,value:NativeRevisionSettlement):void;flush():Promise<void>;retry():Promise<void>;close():Promise<void>;
}
interface Registration{core:object;source:object|undefined;queue:object;open(child:NativeSuggestionChild):NativeRevisionStore}
const owners=new WeakMap<object,Registration>();
export function registerNativeRevisionStore(owner:object,registration:Registration):void{if(owners.has(owner))throw new SharedRelayError('native_revision_outbox');owners.set(owner,registration);}
export function lendNativeRevisionStore<P extends SharedSelectionPolicy>(owner:SharedSuggestionRevisions<P>,child:NativeSuggestionChild<P>):NativeRevisionStore<P>{
 const actual=owners.get(owner);if(!actual?.source||actual.queue!==child.originalQueue||child.port.core!==actual.core||nativeSuggestionQueueView(child.queue)!==child.port)throw new SharedRelayError('native_revision_outbox');
 child.check();if(nativeRelayDeliveryForSource(child.delivery,actual.source,actual.core)!==child.port)throw new SharedRelayError('native_revision_source');
 return actual.open(child as unknown as NativeSuggestionChild) as NativeRevisionStore<P>;
}
