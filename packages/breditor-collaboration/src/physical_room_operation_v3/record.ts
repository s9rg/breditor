/** Nonsecret ordered recovery intent. A completed marker never issues an owner,
 * proves current native state, reconciles copies or permits server activation. */
import {operationV3Fields as fields,operationV3Rows as rows} from './input_snapshot.js';
import {parsePhysicalCatalogV3Manifest} from '../physical_room_catalog_v3/manifest.js';
import {physicalCatalogSelection} from '../physical_room_catalog/policy.js';
import type {PhysicalRoomCatalogV3Selection} from '../physical_room_catalog_v3/contract.js';
import type {PhysicalOperationV3Target,PhysicalOperationV3Family,PhysicalOperationV3Role} from './contract.js';
import {checkPhysicalOperationV3Namespaces} from './namespaces.js';
import {physicalOperationV3Failure as fail,physicalOperationV3Name as name,physicalOperationV3Database as dbName,MAX_PHYSICAL_OPERATION_V3_PLAN_BYTES} from './policy.js';
export interface PhysicalOperationV3Source{readonly catalogDatabase:string;readonly manifest:string;readonly selection:PhysicalRoomCatalogV3Selection}
export interface PhysicalOperationV3Record{readonly format:'breditor/shared-physical-room-catalog-operation';readonly formatVersion:1;readonly database:string;readonly source:PhysicalOperationV3Source;readonly phase:'prepared'|'operational';readonly participants:readonly Readonly<PhysicalOperationV3Target&{state:'reserved'|'started'|'complete'}>[]}
export function initialPhysicalOperationV3Record(database:string,source:PhysicalOperationV3Source,targets:readonly PhysicalOperationV3Target[]):PhysicalOperationV3Record{
 const participants=rows(targets,value=>{const row=fields(value,'id,family,namespaces'),id=name(row['id']),family=row['family'];if(typeof family!=='string')throw fail('physical_operation_v3_diverged');const namespaces=rows(row['namespaces'] as readonly unknown[],item=>{const value=fields(item,'role,database'),role=value['role'];if(typeof role!=='string')throw fail('physical_operation_v3_diverged');return{role:role as PhysicalOperationV3Role,database:dbName(value['database'])};}).sort((a,b)=>a.role<b.role?-1:a.role>b.role?1:0);return{id,family:family as PhysicalOperationV3Family,namespaces,state:'reserved'};}).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 return checkPhysicalOperationV3Record({format:'breditor/shared-physical-room-catalog-operation',formatVersion:1,database,source,phase:'prepared',participants});
}
export function checkPhysicalOperationV3Record(input:unknown,expected?:PhysicalOperationV3Record):PhysicalOperationV3Record{
 let exceeded=false;
 try{
  const raw=fields(input,'format,formatVersion,database,source,phase,participants');if(raw['format']!=='breditor/shared-physical-room-catalog-operation'||raw['formatVersion']!==1||!['prepared','operational'].includes(raw['phase'] as string))throw fail('physical_operation_v3_diverged');
  const sourceRow=fields(raw['source'],'catalogDatabase,manifest,selection'),database=dbName(raw['database']),catalogDatabase=dbName(sourceRow['catalogDatabase']),selection=physicalCatalogSelection(fields(sourceRow['selection'],'catalog,sha256'));if(database===catalogDatabase||typeof sourceRow['manifest']!=='string')throw fail('physical_operation_v3_diverged');
  const manifest=sourceRow['manifest'],metadata=parsePhysicalCatalogV3Manifest(manifest);if(metadata.catalog!==selection.catalog)throw fail('physical_operation_v3_diverged');const inputRows=raw['participants'];if(!Array.isArray(inputRows)||!inputRows.length||inputRows.length>metadata.participants.length)throw fail('physical_operation_v3_diverged');
  const used=new Set([database,catalogDatabase]);let previous='',tail=false;
  const participants=rows(inputRows,value=>{const row=fields(value,'id,family,namespaces,state'),id=name(row['id']),selected=metadata.participants.find(entry=>entry.id===id),state=row['state'];if(id<=previous||!selected||selected.family!==row['family']||!['reserved','started','complete'].includes(state as string)||tail&&state!=='reserved')throw fail('physical_operation_v3_diverged');previous=id;if(state!=='complete')tail=true;return{id,family:selected.family,namespaces:checkPhysicalOperationV3Namespaces(selected.family,row['namespaces'],used),state:state as 'reserved'|'started'|'complete'};});
  if(raw['phase']==='operational'&&participants.some(row=>row.state!=='complete'))throw fail('physical_operation_v3_diverged');
  const result:PhysicalOperationV3Record={format:'breditor/shared-physical-room-catalog-operation',formatVersion:1,database,source:{catalogDatabase,manifest,selection},phase:raw['phase'] as 'prepared'|'operational',participants};if(new TextEncoder().encode(JSON.stringify(result)).length>MAX_PHYSICAL_OPERATION_V3_PLAN_BYTES){exceeded=true;throw fail('physical_operation_v3_budget');}
  const pinned=expected&&checkPhysicalOperationV3Record(expected);if(pinned&&(database!==pinned.database||JSON.stringify(result.source)!==JSON.stringify(pinned.source)||participants.length!==pinned.participants.length||participants.some((row,index)=>{const old=pinned.participants[index];return!old||row.id!==old.id||row.family!==old.family||JSON.stringify(row.namespaces)!==JSON.stringify(old.namespaces);})))throw fail('physical_operation_v3_diverged');return result;
 }catch{throw fail(exceeded?'physical_operation_v3_budget':'physical_operation_v3_diverged');}
}
/** Exactly one next ordered child step, or final publication after all complete. */
export function checkPhysicalOperationV3Transition(before:PhysicalOperationV3Record,next:PhysicalOperationV3Record):void{
 const old=checkPhysicalOperationV3Record(before),after=checkPhysicalOperationV3Record(next,old);if(old.phase!=='prepared')throw fail('physical_operation_v3_diverged');
 if(old.phase!==after.phase){if(after.phase!=='operational'||JSON.stringify(old.participants)!==JSON.stringify(after.participants))throw fail('physical_operation_v3_diverged');return;}
 const at=old.participants.findIndex(row=>row.state!=='complete');if(at<0)throw fail('physical_operation_v3_diverged');
 for(const[index,row]of old.participants.entries()){const changed=after.participants[index]!;if(index!==at?row.state!==changed.state:row.state==='reserved'?changed.state!=='started':row.state!=='started'||changed.state!=='complete')throw fail('physical_operation_v3_diverged');}
}
