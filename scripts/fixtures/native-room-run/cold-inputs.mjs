/** Fresh read factories for the actual prepared catalog. These do not borrow
 * the old job's grant or source owners, and carry no already-acquired actor. */
export function coldRootInputs(f,wasm){const plan=f.data.choice.plan,rows=plan.preparation.plan.participants,read=id=>f.reads.reads.find(row=>row.id===id).read;
 const graphPolicies=rows.filter(row=>row.family==='restored-graph').map(row=>({id:row.id,original:row.selection.original,options:{session:read(row.id).session,checkAuthority(){}}}));
 const localPolicies=rows.filter(row=>row.family==='local-operation-flat').map(row=>({id:row.id,family:row.family,original:row.selection.original,options:{session:read(row.id).session,checkAuthority(){}}}));
 return{wasm,database:f.layout.operationDatabase,catalogDatabase:f.layout.catalogDatabase,expected:plan.catalog,participants:f.options.participants,graphPolicies,localPolicies,checkAuthority(){}};
}
