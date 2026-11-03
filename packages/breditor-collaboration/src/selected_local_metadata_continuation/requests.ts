/** Exact requests for the existing closed receiver contracts. Metadata and
 * publication decisions remain separate; projection invokes neither callback
 * and grants no Native custody. Origin admission remains the receiver's job. */
import type {MetadataContinuationInspectionInput,MetadataContinuationInput} from './inputs.js';
import type {MetadataContinuationChoice} from './contract.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {fail} from './policy.js';
export interface MetadataContinuationRequestSeed extends MetadataContinuationInspectionInput {
 readonly approve:(choice:MetadataContinuationChoice)=>boolean|Promise<boolean>;
 /** Opaque publication decision; continuation must never invoke this hook. */
 readonly approvePublication?:(choice:never)=>boolean|Promise<boolean>;
}
export interface MetadataContinuationRunSeed extends MetadataContinuationRequestSeed {readonly expected:MetadataContinuationChoice}
function seed(input:MetadataContinuationRequestSeed|MetadataContinuationRunSeed,run:boolean){
 const r=fields(input,['database','preparationDatabase','reviewDatabase','metadataDatabase','origin','host','inventory','checkAuthority','approve',...(run?['expected']:[])],['approvePublication']);
 if(typeof r['approve']!=='function'||typeof r['checkAuthority']!=='function'||Object.hasOwn(r,'approvePublication')&&typeof r['approvePublication']!=='function')throw fail();return r;
}
function inspection(r:Record<string,unknown>):MetadataContinuationInspectionInput{return{
 database:r['database'] as string,preparationDatabase:r['preparationDatabase'] as string,reviewDatabase:r['reviewDatabase'] as string,metadataDatabase:r['metadataDatabase'] as string,
 origin:r['origin'] as MetadataContinuationInspectionInput['origin'],host:r['host'] as MetadataContinuationInspectionInput['host'],inventory:r['inventory'] as MetadataContinuationInspectionInput['inventory'],checkAuthority:r['checkAuthority'] as MetadataContinuationInspectionInput['checkAuthority']
};}
/** A preview reads facts and never carries either approval callback. */
export function metadataContinuationPreviewRequest(input:MetadataContinuationRequestSeed):MetadataContinuationInspectionInput{return Object.freeze(inspection(seed(input,false)));}
/** Continuation carries only its own decision. Final publication stays with
 * the owning joint coordinator and still requires its separate fresh approval. */
export function metadataContinuationRunRequest(input:MetadataContinuationRunSeed):MetadataContinuationInput{const r=seed(input,true);return Object.freeze({...inspection(r),expected:r['expected'] as MetadataContinuationChoice,approve:r['approve'] as MetadataContinuationInput['approve']});}
