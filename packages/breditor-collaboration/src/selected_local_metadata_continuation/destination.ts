/** Read existing destination bytes through real namespace custody, then let
 * the original runtime replay/admit them again. Unrelated later facts refuse. */
import {LocalReviewDeliveryStore} from '../selected_local_review_delivery/store.js';
import {LocalMetadataDeliveryStore} from '../selected_local_metadata_delivery/store.js';
import {localJson} from '../selected_local_review_delivery/policy.js';
import {metadataJson} from '../selected_local_metadata_delivery/policy.js';
import {retainSelectedNativeDeliveryResource} from '../relay/native_delivery.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {LocalReviewDeliverySnapshot,LocalReviewRoomBundle} from '../selected_local_review_delivery/contract.js';
import type {LocalMetadataDeliverySnapshot,LocalMetadataRoomBundle} from '../selected_local_metadata_delivery/contract.js';
import type {MetadataContinuationChoice} from './contract.js';
import {verifyContinuedReviewFacts,verifyContinuedMetadataFacts} from './destination_facts.js';
const reviewApi={open:LocalReviewDeliveryStore.prototype.open,close:LocalReviewDeliveryStore.prototype.close},metadataApi={open:LocalMetadataDeliveryStore.prototype.open,close:LocalMetadataDeliveryStore.prototype.close};
export async function readContinuedReview(scope:SelectedNativeRecoveryScope,choice:MetadataContinuationChoice,original:LocalMetadataDeliverySnapshot,check:()=>void):Promise<LocalReviewDeliverySnapshot>{
 const store=new LocalReviewDeliveryStore(choice.review,check);retainSelectedNativeDeliveryResource(scope,{check,close:()=>reviewApi.close.call(store)});let primary:unknown,failed=false;
 try{const snapshot=await reviewApi.open.call(store);verifyContinuedReviewFacts(choice,original,snapshot);return snapshot;}catch(error){primary=error;failed=true;throw error;}finally{try{await reviewApi.close.call(store);}catch(cleanup){throw new AggregateError(failed?[primary,cleanup]:[cleanup],'Continued review read cleanup did not finish');}}
}
export async function readContinuedMetadata(scope:SelectedNativeRecoveryScope,choice:MetadataContinuationChoice,original:LocalMetadataDeliverySnapshot,review:LocalReviewDeliverySnapshot,check:()=>void):Promise<LocalMetadataDeliverySnapshot>{
 const store=new LocalMetadataDeliveryStore(choice.metadata,check);retainSelectedNativeDeliveryResource(scope,{check,close:()=>metadataApi.close.call(store)});let primary:unknown,failed=false;
 try{const snapshot=await metadataApi.open.call(store);verifyContinuedMetadataFacts(original,review,snapshot);return snapshot;
 }catch(error){primary=error;failed=true;throw error;}finally{try{await metadataApi.close.call(store);}catch(cleanup){throw new AggregateError(failed?[primary,cleanup]:[cleanup],'Continued metadata read cleanup did not finish');}}
}
export async function continuedReviewBundle(scope:SelectedNativeRecoveryScope,prepared:LocalReviewRoomBundle['prepared'],snapshot:LocalReviewDeliverySnapshot,check:()=>void):Promise<LocalReviewRoomBundle>{const actual=await scope.retainCurrent(),integrity=prepareArchiveIntegrity({...actual.integrity,checkAuthority:check}),text=localJson(snapshot),file=new Blob([text],{type:'application/vnd.breditor.selected-local-review-delivery+json'});return Object.freeze({format:'breditor/selected-local-review-room-bundle',formatVersion:1,prepared,current:actual.current,delivery:{file,bytes:file.size,sha256:await integrity.digest(file)}});}
export async function continuedMetadataBundle(scope:SelectedNativeRecoveryScope,parent:LocalReviewRoomBundle,snapshot:LocalMetadataDeliverySnapshot,check:()=>void):Promise<LocalMetadataRoomBundle>{const actual=await scope.retainCurrent(),integrity=prepareArchiveIntegrity({...actual.integrity,checkAuthority:check}),text=metadataJson(snapshot),file=new Blob([text],{type:'application/vnd.breditor.selected-local-metadata+json'});return Object.freeze({format:'breditor/selected-local-metadata-room-bundle',formatVersion:1,parent,metadata:{file,bytes:file.size,sha256:await integrity.digest(file)}});}
