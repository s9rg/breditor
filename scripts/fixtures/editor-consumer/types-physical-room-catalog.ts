import {hashSharedArchive,readSharedServerLogGenerationRoomArchive,SharedPhysicalRoomRecoveryCatalogArchive,SharedPhysicalRoomRecoveryCatalog,SharedRoomRecoveryCatalogArchiveV2,type SharedArchiveDigestModule,type SharedArchiveFileDigest,type SharedPhysicalRoomRecoveryCatalogSource,type SharedServerLogGenerationRoomBackupIdentity} from '@breditor/collaboration';
import * as runtime from '@breditor/collaboration/wasm';
declare const file:Blob,server:SharedServerLogGenerationRoomBackupIdentity,archive:SharedPhysicalRoomRecoveryCatalogArchive,sources:readonly SharedPhysicalRoomRecoveryCatalogSource[];
const wasm:SharedArchiveDigestModule=runtime,options={wasm,checkAuthority(){}};
const digest:Promise<SharedArchiveFileDigest>=hashSharedArchive(file,options);
const transport=readSharedServerLogGenerationRoomArchive(file,server,options);
const opened=SharedPhysicalRoomRecoveryCatalog.begin({...options,database:'explicit-selected-retention',expected:archive.selection(),archive});
const copy:ReadonlyMap<string,Blob>=archive.files();
opened.then(async catalog=>{catalog.checkSources(sources);await catalog.verify();await catalog.close();});
// @ts-expect-error Dedicated native digests use canonical decimals, never coercing raw numeric totals.
runtime.SharedArchiveDigest.create(1);
// @ts-expect-error Immutable retained source pins cannot be rewritten through a public DTO.
archive.metadata().current.server.identity.native.manifest.push(1);
// @ts-expect-error Transport integrity is not native host authentication or whole-room activation.
opened.then(catalog=>catalog.activate());
// @ts-expect-error This retention contract does not manufacture inactive participant owners.
opened.then(catalog=>catalog.stage([]));
// @ts-expect-error Physical native identities are not original V2 inventory selections.
SharedRoomRecoveryCatalogArchiveV2.capture({...options,catalog:'wrong-family',inventory:{file,expected:archive.metadata().current.participants.identity},server:{file,expectedSha256:'0'.repeat(64)},participants:[]});
void [digest,transport,copy];
