/** Private preparation is DATA, never a current writer/activation capability. */
import{prepareSharedIndependentDeliveryBranchUnion}from'@breditor/collaboration';
import type{SharedIndependentDeliveryUnionOptions,SharedIndependentDeliveryUnionPreparation,SharedIndependentDeliveryUnionReadFactory,SharedIndependentDeliveryRecoveryFactory}from'@breditor/collaboration';
declare const chosen:SharedIndependentDeliveryUnionOptions,ordinary:SharedIndependentDeliveryRecoveryFactory;
const result:Promise<SharedIndependentDeliveryUnionPreparation>=prepareSharedIndependentDeliveryBranchUnion(chosen);
const readonlyFactory:SharedIndependentDeliveryUnionReadFactory=chosen.session;
// @ts-expect-error JSON may not choose a native factory or activate the room.
prepareSharedIndependentDeliveryBranchUnion({...chosen,activate:true});
// @ts-expect-error Readonly native reads are mandatory, not selected from saved access.
prepareSharedIndependentDeliveryBranchUnion({...chosen,session:ordinary});
// @ts-expect-error Full exact input strings must be retained, not just ASTs or digest claims.
prepareSharedIndependentDeliveryBranchUnion({...chosen,incomingJson:{document:'AST'}});
// @ts-expect-error The result is not editable state or custody.
result.then(value=>value.native.documentChanged=false);
// @ts-expect-error Preparation never supplies a credential/activation method.
result.then(value=>value.activate());
void readonlyFactory;
