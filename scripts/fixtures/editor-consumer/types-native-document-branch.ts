/** Document retention is not paired comment custody or a writer/activation grant. */
import type {SharedRichEditor} from '../../../packages/breditor-collaboration/dist/core.js';
import {reserveNativeRecovery} from '../../../packages/breditor-collaboration/dist/core.js';
import * as api from '@breditor/collaboration';
declare const core:SharedRichEditor,source:SharedRichEditor<'document-v1'>;
const held=reserveNativeRecovery([core]);
const changed:boolean=held.reconcileDocumentBranch(core,source);
const coverage:void=core.verifyRetainedDocumentBranch(source);
const supported:boolean=core.supportsRetainedDocumentBranch();
// @ts-expect-error A serialized checkpoint is not a real source facade.
held.reconcileDocumentBranch(core,{checkpointJson:'data'});
// @ts-expect-error A choice or recovery report supplies no native target facade.
held.reconcileDocumentBranch({ready:true},source);
// @ts-expect-error Pure coverage does not return authoring permission.
const grant:boolean=core.verifyRetainedDocumentBranch(source);
// @ts-expect-error Public package callers cannot construct the private reservation.
api.reserveNativeRecovery;
// @ts-expect-error Document-only recovery is not a comment-adoption operation.
held.reconcileReviewBranch;
held.close();void changed;void coverage;void supported;
