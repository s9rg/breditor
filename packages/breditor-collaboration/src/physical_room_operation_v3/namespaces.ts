/** Closed family layouts and global namespace separation. Role names identify
 * genuine component contracts, never infer one family's source from another. */
import {operationV3Fields as fields,operationV3Rows as rows} from './input_snapshot.js';
import type {PhysicalOperationV3Family,PhysicalOperationV3Namespace,PhysicalOperationV3Role} from './contract.js';
import {physicalOperationV3Failure as fail,physicalOperationV3Database as name} from './policy.js';
const required:Readonly<Record<PhysicalOperationV3Family,readonly PhysicalOperationV3Role[]>>={
 original:['operation','recovery','document','uploads'],
 generation:['operation','recovery','source','uploads'],
 'independent-local':['operation','journal','source','recovery','recovery-source','uploads'],
 'independent-delivery':['operation','source','recovery','recovery-source','uploads'],
 'restored-graph':['operation','journal','source','uploads'],
 'local-operation-snapshot':['operation','journal','source','uploads'],
 'local-operation-flat':['operation','journal','source','uploads'],
};
/** Inputs must already have canonical role order. A decoder never repairs them. */
export function checkPhysicalOperationV3Namespaces(family:PhysicalOperationV3Family,input:unknown,used:Set<string>):PhysicalOperationV3Namespace[]{
 const needed=Object.hasOwn(required,family)?required[family]:undefined;if(!needed||!Array.isArray(input)||input.length<needed.length||input.length>7)throw fail('physical_operation_v3_diverged');
 const allowed=new Set<PhysicalOperationV3Role>([...needed,...(family==='original'?['versions','suggestions','revisions'] as const:[])]),roles=new Set<string>();let previous='';
 const result=rows(input,value=>{const row=fields(value,'role,database'),role=row['role'];if(typeof role!=='string'||role<=previous||!allowed.has(role as PhysicalOperationV3Role)||roles.has(role))throw fail('physical_operation_v3_diverged');previous=role;roles.add(role);const database=name(row['database']);if(used.has(database))throw fail('physical_operation_v3_diverged');used.add(database);return{role:role as PhysicalOperationV3Role,database};});
 if(needed.some(role=>!roles.has(role))||roles.has('revisions')&&!roles.has('suggestions'))throw fail('physical_operation_v3_diverged');return result;
}
