/** Internal transport view. It carries no source/native/auth permission itself. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedDocumentVersionsOptions,SharedDocumentVersionEntry,SharedDocumentVersionStatus,VersionCatalogSnapshot} from './types.js';
import type {VersionCatalogStore} from './store.js';
export interface VersionSyncStore<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly options:Omit<SharedDocumentVersionsOptions<P>,'storage'>&{readonly storage:Pick<SharedDocumentVersionsOptions<P>['storage'],'core'>};
 state():ReturnType<VersionCatalogStore<P>['state']>;
 subscribe(listener:()=>void):()=>void;
 queued():readonly string[];entry(id:string):SharedDocumentVersionEntry|null;
 packet(id:string):string;versionStatus(id:string):SharedDocumentVersionStatus;
 flush():Promise<void>;
 adoptCatalog(snapshot:VersionCatalogSnapshot):Promise<void>;
 accept(id:string,entry:SharedDocumentVersionEntry):Promise<void>;
 cachePacket(packet:string,entry:SharedDocumentVersionEntry):Promise<string>;
}
