/** Atomic native input is not executable authority or complete room activation. */
import type{SharedRichEditor}from'../../../packages/breditor-collaboration/dist/core.js';
import{reserveNativeRecovery}from'../../../packages/breditor-collaboration/dist/core.js';
import type{SharedNativeBranchUnionAuthorization,SharedNativeBranchUnionOutcome}from'@breditor/collaboration';
import*as api from'@breditor/collaboration';
declare const target:SharedRichEditor,source:SharedRichEditor<'document-v1'>,authorization:SharedNativeBranchUnionAuthorization;
const held=reserveNativeRecovery([target]);
const result:SharedNativeBranchUnionOutcome=held.reconcileNativeBranch(target,source,[authorization]);
const documentChanged:boolean=result.documentChanged,reviewChanged:boolean=result.reviewChanged;
const covered:void=target.verifyNativeBranchUnion(source),supported:boolean=target.supportsNativeBranchUnion();
// @ts-expect-error Plain saved content is not a genuine native owner.
held.reconcileNativeBranch(target,{checkpointJson:'data'},[authorization]);
// @ts-expect-error A role alone does not pin an authenticated event-prefix window.
held.reconcileNativeBranch(target,source,[{source:{actor:'peer',principal:'bob',access:'moderate'}}]);
// @ts-expect-error Event counters remain exact decimal strings.
held.reconcileNativeBranch(target,source,[{...authorization,through:9007199254740993}]);
// @ts-expect-error One publication is not a writer/serving grant.
const grant:boolean=target.verifyNativeBranchUnion(source);
// @ts-expect-error Native recovery construction stays absent from the public package root.
api.reserveNativeRecovery;
// @ts-expect-error The detached outcome is readonly, not a live phase marker.
result.reviewChanged=true;
held.close();void documentChanged;void reviewChanged;void covered;void supported;
