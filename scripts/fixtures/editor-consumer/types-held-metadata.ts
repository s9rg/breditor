import * as publicApi from '@breditor/collaboration';
import {prepareCompoundMetadata,type PreparedCompoundMetadata} from '../../../packages/breditor-collaboration/dist/metadata/compound_preparation.js';
import type {NativeRelayDelivery} from '../../../packages/breditor-collaboration/dist/relay/native_delivery.js';
import {RelayWorkCustody} from '../../../packages/breditor-collaboration/dist/relay/work_custody.js';import type {RelayWorkAdmission} from '../../../packages/breditor-collaboration/dist/relay/work_custody.js';
declare const source:publicApi.SharedIndependentDeliverySession<'document-v1'>,context:NativeRelayDelivery,grant:RelayWorkAdmission,core:publicApi.SharedRichEditor;
const result:Promise<PreparedCompoundMetadata<'document-v1'>>=prepareCompoundMetadata<'document-v1'>(source,context);
const work:RelayWorkCustody=RelayWorkCustody.ordinaryDuringRecovery(core,()=>true,()=>Error('excluded'),grant);
// @ts-expect-error Constructor admission requires the actual opaque grant.
RelayWorkCustody.ordinaryDuringRecovery(core,()=>true,()=>Error('excluded'),{token:{}});
// @ts-expect-error Ordinary constructors cannot select the private constructor mode by a boolean.
new RelayWorkCustody(core,()=>true,()=>Error('excluded'),grant,true);
// @ts-expect-error Preparation is private composition, not a serialized options mode.
source.openVersionCatalog({getToken:()=>'token',held:true});
// @ts-expect-error The public root does not issue native preparation authority.
publicApi.prepareCompoundMetadata(source,context);
// @ts-expect-error No ordinary mutation-work custody is exposed by the public root.
publicApi.RelayWorkCustody.ordinaryDuringRecovery(core,()=>true,()=>Error('excluded'),grant);
// @ts-expect-error A decoded identity cannot replace an actual compound source.
prepareCompoundMetadata({core},context);
// @ts-expect-error Preparation preserves the exact selected document policy.
prepareCompoundMetadata<'original'>(source,context);
void result;void work;
