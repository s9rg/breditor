/** Replayable complete files are not a mutable room, credential or historical-role grant. */
import{SharedIndependentDeliveryUnionArchive,prepareSharedIndependentDeliveryUnion,readPreparedSharedIndependentDeliveryUnion}from'@breditor/collaboration';
import type{SharedIndependentDeliveryUnionArchiveBuildOptions,SharedIndependentDeliveryUnionArchiveReadOptions,SharedIndependentDeliveryUnionArchiveChoice,SharedIndependentDeliveryUnionArchiveFile,SharedIndependentDeliveryUnionParticipantFile}from'@breditor/collaboration';
declare const build:SharedIndependentDeliveryUnionArchiveBuildOptions,read:SharedIndependentDeliveryUnionArchiveReadOptions,choice:SharedIndependentDeliveryUnionArchiveChoice,file:Blob;
const ready=SharedIndependentDeliveryUnionArchive.build(build);
ready.then(result=>{if(result.kind==='ready'){const data:SharedIndependentDeliveryUnionArchiveFile={choice:result.archive.choice(),file:result.archive.file()},output:SharedIndependentDeliveryUnionParticipantFile=result.archive.output();prepareSharedIndependentDeliveryUnion(data,read);const root:string=data.choice.selection.manifestSha256;void output;void root;result.archive.dispose();}else{const pending:readonly unknown[]=result.pending;void pending;}});
const loaded:Promise<SharedIndependentDeliveryUnionArchiveFile>=readPreparedSharedIndependentDeliveryUnion(choice,read);
SharedIndependentDeliveryUnionArchive.read(file,choice,read);
// @ts-expect-error The manifest root is explicitly not a whole-file SHA-256.
choice.selection.sha256;
// @ts-expect-error A saved archive does not contain fresh authenticated original-role grants.
SharedIndependentDeliveryUnionArchive.read(file,choice,{wasm:read.wasm,session:read.session,checkAuthority(){}});
// @ts-expect-error Construction does not activate or create any source target.
SharedIndependentDeliveryUnionArchive.build({...build,activate:true});
// @ts-expect-error All native reads must be explicit readonly factories.
SharedIndependentDeliveryUnionArchive.build({...build,session:{...build.session,readOnly:false}});
// @ts-expect-error A prepared file is DATA, not source custody.
loaded.then(value=>value.core.type('No'));
// @ts-expect-error Complete original files cannot be replaced with AST strings.
SharedIndependentDeliveryUnionArchive.build({...build,incoming:{...build.incoming,file:'AST'}});
void loaded;
