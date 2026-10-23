/** Private native prefix borrows preserve explicit selection-policy types and
 * nominal source/archive owners; they never become a package-root API. */
import {NativeInputIncomingSourceCapture,nativeInputIncomingSource} from '../../../packages/breditor-collaboration/dist/native_input_operation/incoming_source.js';
import type {NativeInputIncomingArchive,NativeInputIncomingSourceOptions} from '../../../packages/breditor-collaboration/dist/native_input_operation/incoming_source_contract.js';
import type {LocalOperationReadOptions} from '../../../packages/breditor-collaboration/dist/independent_local_operation/portable_policy.js';
import type {SharedIndependentHistoryPersistentSession} from '../../../packages/breditor-collaboration/dist/independent_history/session.js';
// @ts-expect-error This private capture is not promoted into the supported root API.
import {NativeInputIncomingSourceCapture as PublicCapture} from '../../../packages/breditor-collaboration/dist/index.js';

declare const archive:NativeInputIncomingArchive;
declare const documentSource:SharedIndependentHistoryPersistentSession<'document-v1'>;
declare const originalSource:SharedIndependentHistoryPersistentSession<'original'>;
declare const read:LocalOperationReadOptions<'document-v1'>;
const options:NativeInputIncomingSourceOptions<'document-v1'>={...read,input:archive,source:documentSource};
void nativeInputIncomingSource.capture(options);
// @ts-expect-error A differently selected native source cannot become document-v1.
const wrongSource:NativeInputIncomingSourceOptions<'document-v1'>={...read,input:archive,source:originalSource};
// @ts-expect-error Copied methods do not provide the private native capture brand.
const fake:NativeInputIncomingSourceCapture={dispose(){}};
// @ts-expect-error Only the actual static capture path constructs this owner.
new NativeInputIncomingSourceCapture({},{});
// @ts-expect-error A Blob cannot stand in for an admitted nominal archive.
const fileInsteadOfArchive:NativeInputIncomingArchive={kind:'flat-local-v1',backup:new Blob()};
// @ts-expect-error Old delivery graphs retain their own distinct meaning.
const deliveryKind:NativeInputIncomingArchive={kind:'restored-graph',backup:archive.backup};
void wrongSource;void fake;void PublicCapture;void fileInsteadOfArchive;void deliveryKind;
