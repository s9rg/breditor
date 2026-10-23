/** Historical plan DATA validation and new input identity construction. A plan
 * grants no factory, namespace custody, writer or endpoint. First-snapshot SHA
 * is checked against the genuine framing reader's verified literal recipe;
 * later canonical graph identity uses the manifest, byte length and MIME. */
import {generationFields} from '../generation_source/identity.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import {localOperationBackupSelection,localPortableHash} from '../independent_local_operation/portable_identity.js';
import type {LocalOperationBackupSelection} from '../independent_local_operation/portable_contract.js';
import type {FlatLocalIdentity} from './head.js';import type {FlatLocalRecipe} from './contract.js';
import {FLAT_LOCAL_MIME} from './framing.js';import {flatLocalFailure as fail} from './failure.js';
export interface FlatLocalCohort{readonly parentDatabase:string;readonly uploadsDatabase:string}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export async function makeFlatLocalIdentity(expected:LocalOperationBackupSelection,bytes:number,database:string,sourceDatabase:string,cohort?:FlatLocalCohort):Promise<FlatLocalIdentity>{
 const plan=JSON.stringify({format:'breditor/shared-flat-local-input-plan',formatVersion:1,input:{kind:'flat-local-v1',selection:expected,bytes,mime:FLAT_LOCAL_MIME},journal:database,source:sourceDatabase,...(cohort?{cohort}:{})});if(new TextEncoder().encode(plan).length>128*1024)throw fail();return Object.freeze({plan,operation:await segmentedDigest('breditor/flat-local-input/1\0'+plan),origin:expected.original.sha256,database,sourceDatabase});
}
/** This function checks a data record only. Callers that admit a whole graph
 * first obtain the recipe from the actual closed framing owner. */
export async function readFlatLocalStateIdentity(raw:unknown,expected:LocalOperationBackupSelection,recipe:FlatLocalRecipe,guard:()=>void):Promise<FlatLocalIdentity>{
 if(!generationFields(raw,'plan,operation,origin,database,sourceDatabase')||typeof raw['plan']!=='string'||new TextEncoder().encode(raw['plan']).length>128*1024||!localPortableHash(raw['operation'])||raw['origin']!==expected.original.sha256||typeof raw['database']!=='string'||typeof raw['sourceDatabase']!=='string')throw fail('flat_local_input_identity');
 const id={plan:raw['plan'],operation:raw['operation'],origin:raw['origin'],database:raw['database'],sourceDatabase:raw['sourceDatabase']},parsed:unknown=JSON.parse(id.plan),hasCohort=!!parsed&&typeof parsed==='object'&&Object.hasOwn(parsed,'cohort');
 if(!generationFields(parsed,'format,formatVersion,input,journal,source'+(hasCohort?',cohort':''))||parsed['formatVersion']!==1||parsed['journal']!==id.database||parsed['source']!==id.sourceDatabase)throw fail();
 const input=parsed['input'];let canonicalInput:object,format:string,domain:string;
 if(recipe.kind==='snapshot'){
  if(parsed['format']!=='breditor/shared-restored-local-operation-plan'||!generationFields(input,'kind,selection,fileSha256')||input['kind']!=='snapshot-v1'||!same(localOperationBackupSelection(input['selection']),expected)||input['fileSha256']!==recipe.sha256)throw fail('flat_local_input_snapshot');
  canonicalInput={kind:'snapshot-v1',selection:expected,fileSha256:recipe.sha256};format='breditor/shared-restored-local-operation-plan';domain='breditor/restored-local-operation/1\0';
 }else{
  if(parsed['format']!=='breditor/shared-flat-local-input-plan'||!generationFields(input,'kind,selection,bytes,mime')||input['kind']!=='flat-local-v1'||!same(localOperationBackupSelection(input['selection']),expected)||input['bytes']!==recipe.bytes||input['mime']!==FLAT_LOCAL_MIME||expected.manifestSha256!==recipe.manifestSha256)throw fail('flat_local_input_manifest');
  canonicalInput={kind:'flat-local-v1',selection:expected,bytes:recipe.bytes,mime:FLAT_LOCAL_MIME};format='breditor/shared-flat-local-input-plan';domain='breditor/flat-local-input/1\0';
 }
 let cohort:FlatLocalCohort|undefined;if(hasCohort){const c=parsed['cohort'];if(!generationFields(c,'parentDatabase,uploadsDatabase')||typeof c['parentDatabase']!=='string'||typeof c['uploadsDatabase']!=='string')throw fail();cohort={parentDatabase:c['parentDatabase'],uploadsDatabase:c['uploadsDatabase']};}
 const names=[id.database,id.sourceDatabase,...(cohort?[cohort.parentDatabase,cohort.uploadsDatabase]:[])];if(names.some(n=>!n||n.length>200)||new Set(names).size!==names.length)throw fail();
 const canonical=JSON.stringify({format,formatVersion:1,input:canonicalInput,journal:id.database,source:id.sourceDatabase,...(cohort?{cohort}:{})});if(canonical!==id.plan||id.operation!==await segmentedDigest(domain+id.plan))throw fail('flat_local_input_identity');guard();return id;
}
