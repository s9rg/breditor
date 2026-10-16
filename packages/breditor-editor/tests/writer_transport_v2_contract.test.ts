import {afterEach,describe,expect,it,vi} from "vitest";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedRustOwner,SharedView} from "../../breditor-collaboration/src/types.js";
import {SharedRelaySync} from "../../breditor-collaboration/src/relay/sync.js";
import {registerSharedRelayWriter} from "../../breditor-collaboration/src/relay/registration.js";
import {RelayChannel} from "../../breditor-collaboration/src/relay/channel.js";
import {groupMetadata,identity,prefixAt,transportCapabilities,transportVersion} from "../../breditor-collaboration/src/relay/validation.js";

const digest=`sha256:${"0".repeat(64)}`,other=`sha256:${"1".repeat(64)}`;
const base={endpoint:"ws://127.0.0.1:49786/",principal:"alice",room:"room",writer:"101",credential:"a".repeat(64)};
const group=(version:1|2)=>JSON.stringify({format:"breditor/shared-writer-group",formatVersion:version,kind:"action",writer:"101",from:"0",through:"1",previousDigest:other,groupDigest:digest});
function owner(general=false,natural=false,readOnly=false){
 const view={format:"breditor/shared-rich-view",formatVersion:1,revision:"1",readOnly,...(general?{rangeEditing:"general-v1"}:{}),...(natural?{historyGrouping:"typing-v1"}:{})} as SharedView;
 const checkpoint=()=>{
  const header={format:general?(natural?"breditor/rich-replica-general-typing-journal":"breditor/rich-replica-general-journal"):(natural?"breditor/rich-replica-typing-journal":"breditor/rich-replica-journal"),version:general||natural?1:12,document:"room",writer:"101"};
  return JSON.stringify(natural?{format:general?"breditor/shared-general-typing-session":"breditor/shared-typing-session",formatVersion:1,modelVersion:11,journalVersion:12,journal:header}:header);
 };
 const clock=()=>JSON.stringify({writer:"101",through:"1",prefixDigest:digest});
 const groups=(version:1|2)=>JSON.stringify({format:"breditor/shared-writer-groups",formatVersion:version,groups:[group(version)]});
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),observe:()=>({view_json:()=>JSON.stringify(view),free:vi.fn()}),free:vi.fn(),checkpoint,typing_checkpoint:checkpoint,general_checkpoint:checkpoint,general_typing_checkpoint:checkpoint,
  general_range_version:()=>"1",enable_general_ranges:vi.fn(),replace_general_range_text:vi.fn(),replace_general_range_plain_text:vi.fn(),replace_general_range_typing_text:vi.fn(),
  typing_history_version:()=>"1",enable_typing_history:vi.fn(),close_typing_group:vi.fn(),insert_typing_text:vi.fn(),delete_typing_range:vi.fn(),
  writer_groups:vi.fn(()=>groups(1)),writer_clock:vi.fn(clock),writer_transport_v2_version:()=>"2",writer_groups_v2:vi.fn(()=>groups(2)),writer_clock_v2:vi.fn(clock)};
 return {raw:raw as unknown as SharedRustOwner,methods:raw,core:()=>new SharedRichEditor(raw as unknown as SharedRustOwner)};
}
afterEach(()=>vi.restoreAllMocks());

describe("explicit packing-independent writer transport",()=>{
 it("keeps original reads distinct and forwards the opaque guarded V2 reads even in read-only mode",()=>{
  const a=owner(false,false,true),core=a.core();expect(core.supportsWriterTransportV2()).toBe(true);
  expect(core.writerGroupsV2("0","1").formatVersion).toBe(2);expect(core.writerClockV2("101").through).toBe("1");
  expect(a.methods.writer_groups_v2.mock.calls[0]?.[1]).toBe("0");expect(a.methods.writer_groups).not.toHaveBeenCalled();expect(a.methods.writer_clock).not.toHaveBeenCalled();
  expect(core.writerGroups("0").formatVersion).toBe(1);expect(core.writerClock("101").through).toBe("1");core.dispose();
 });
 it("requires all three methods and the exact version; stale reads reject before capability checks",()=>{
  for(const field of ["writer_transport_v2_version","writer_groups_v2","writer_clock_v2"] as const){const a=owner();delete (a.raw as unknown as Record<string,unknown>)[field];const core=a.core();expect(core.supportsWriterTransportV2()).toBe(false);expect(core.supportsWriterTransport()).toBe(true);expect(()=>core.writerGroupsV2("0","0")).toThrow("older shared publication");expect(()=>core.writerGroupsV2("0")).toThrow("matching native packing-independent");expect(()=>core.writerClockV2("101")).toThrow("matching native packing-independent");expect(a.methods.writer_groups).not.toHaveBeenCalled();core.dispose();}
  const a=owner();a.raw.writer_transport_v2_version=()=>"1";const core=a.core();expect(core.supportsWriterTransportV2()).toBe(false);expect(()=>core.writerGroupsV2("x".repeat(11))).toThrow("matching native");core.dispose();
 });
 it("binds the explicitly selected transport independently from native range/history families",()=>{
  for(const general of [false,true])for(const natural of [false,true])for(const v2 of [false,true]){
   const a=owner(general,natural),core=a.core(),id={...base,...(v2?{writerTransport:"atomic-v2" as const}:{})},getToken=vi.fn();
   expect(()=>new SharedRelaySync(core,{identity:{...id,writer:"202"},getToken,autoConnect:false})).toThrow("leased room/writer/model/history/range");
   const sync=new SharedRelaySync(core,{identity:id,getToken,autoConnect:false});expect(sync.state().localThrough).toBe("1");expect(getToken).not.toHaveBeenCalled();expect(v2?a.methods.writer_clock:a.methods.writer_clock_v2).not.toHaveBeenCalled();sync.dispose();core.dispose();
  }
 });
 it("does not auto-upgrade identities or negotiate a missing or opposite transport",()=>{
  expect(identity(base)).toEqual(base);expect(identity({...base,writerTransport:"atomic-v2"})).toEqual({...base,writerTransport:"atomic-v2"});expect(Object.isFrozen(identity(base))).toBe(true);
  for(const invalid of [null,"2",2,"v2"]){expect(()=>transportVersion(invalid)).toThrow("writer_transport_invalid");}
  expect(transportCapabilities(undefined,1)).toEqual([]);expect(transportCapabilities(["presence","writerTransportV2"],2)).toEqual(["presence","writerTransportV2"]);
  for(const [caps,version]of [[["writerTransportV2"],1],[[],2],[["assets","assets"],1],[["unknown"],1]] as const)expect(()=>transportCapabilities(caps,version)).toThrow();
  expect(()=>groupMetadata(group(1),2)).toThrow("writer_origin_invalid");expect(()=>groupMetadata(group(2))).toThrow("writer_origin_invalid");
  const a=owner(),core=a.core();expect(prefixAt(core,"101","0",2)).toBe(other);expect(a.methods.writer_groups_v2).toHaveBeenCalled();expect(a.methods.writer_groups).not.toHaveBeenCalled();expect(()=>prefixAt(core,"101","2",2)).toThrow("server_ahead");core.dispose();
 });
 it("registration persists the chosen contract only after exact handshake confirmation",async()=>{
  const descriptor=JSON.stringify({format:"breditor/shared-rich-profile-descriptor",formatVersion:1,abiVersion:1,modelVersion:11,journalVersion:12,schema:{name:"test",version:1},schemaFingerprint:digest});
  for(const v2 of [false,true]){
   const request=vi.fn(async(input:Record<string,unknown>)=>input["kind"]==="authenticate"?{kind:"authenticated",capabilities:v2?["writerTransportV2"]:[],descriptor,frame:JSON.stringify({format:"breditor/rich-replica-update",document:"room"})}:{kind:"registered",registration:{lease:{writer:"101"},credential:base.credential}}),close=vi.fn(),saveIdentity=vi.fn(async()=>{});
   vi.spyOn(RelayChannel,"open").mockResolvedValue({request,close} as unknown as RelayChannel);
   const registration=await registerSharedRelayWriter({endpoint:base.endpoint,principal:"alice",room:"room",getToken:()=>"b".repeat(64),saveIdentity,...(v2?{writerTransport:"atomic-v2"}:{})});
   expect(request.mock.calls[0]?.[0]).toEqual({kind:"authenticate",principal:"alice",token:"b".repeat(64),...(v2?{capabilities:["writerTransportV2"]}:{})});expect(saveIdentity).toHaveBeenCalledWith(registration.identity);expect(registration.identity.writerTransport).toBe(v2?"atomic-v2":undefined);expect(close).toHaveBeenCalled();vi.restoreAllMocks();
  }
  const request=vi.fn(async()=>({kind:"authenticated",capabilities:[],descriptor})),saveIdentity=vi.fn();vi.spyOn(RelayChannel,"open").mockResolvedValue({request,close:vi.fn()} as unknown as RelayChannel);
  await expect(registerSharedRelayWriter({endpoint:base.endpoint,principal:"alice",room:"room",writerTransport:"atomic-v2",getToken:()=>"b".repeat(64),saveIdentity})).rejects.toThrow("writer_transport_mismatch");expect(request).toHaveBeenCalledTimes(1);expect(saveIdentity).not.toHaveBeenCalled();
 });
});
