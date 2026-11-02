/** Installed public surface: additive read-only raster controls. */
import {SharedServerLogGenerationRecoveryHost,SharedServerLogGenerationDeliveryRecoveryHost,MAX_SERVER_GENERATION_RECOVERY_RASTER_BYTES,MAX_SERVER_GENERATION_RECOVERY_RASTER_RESPONSE_BYTES,type SharedServerLogGenerationRecoveryRasterRead} from '@breditor/collaboration';
export async function readRaster(host:SharedServerLogGenerationRecoveryHost|SharedServerLogGenerationDeliveryRecoveryHost,asset:string,signal:AbortSignal){
 const read:SharedServerLogGenerationRecoveryRasterRead=await host.readRaster(asset,signal);
 const limit:number=MAX_SERVER_GENERATION_RECOVERY_RASTER_BYTES+MAX_SERVER_GENERATION_RECOVERY_RASTER_RESPONSE_BYTES;
 if(read.raster){const payload:Blob=read.raster.blob;const bytes:number=read.raster.info.bytes;void [payload,bytes,limit];
  // @ts-expect-error recovery data is immutable
  read.raster.info.asset='different';
 }
 // @ts-expect-error no serialized response can activate a service
 read.activate();
 // @ts-expect-error the content identifier is a string, never a provider URL object
 host.readRaster({url:asset});
 return read;
}
