import {describe,it,expect,vi} from "vitest";
import {revisionInfo,revisionReceipt,revisionRequest,revisionsDescriptor} from "../../breditor-collaboration/src/suggestion_revisions/transport.js";
import {checkRevisionRecord} from "../../breditor-collaboration/src/suggestion_revisions/database.js";
import {readRevisionFeed,checkRevisionFeed} from "../../breditor-collaboration/src/suggestion_revisions/feed.js";
import {submitRevision} from "../../breditor-collaboration/src/suggestion_revisions/submit.js";
import {captureFormatRevision} from "../../breditor-collaboration/src/suggestion_revisions/rebase_format.js";
const id=(n:number)=>`sha256:${n.toString(16).padStart(64,"0")}`;
const identity={endpoint:"ws://127.0.0.1:49786/",principal:"alice",room:"room",binding:"b".repeat(64),documentWriter:"101",effectWriter:"202",writerTransport:"atomic-v2" as const},binding="c".repeat(64);
const descriptor={format:"breditor/relay-suggestion-revisions",formatVersion:1,document:"room",binding,suggestionBinding:identity.binding};
const permissions={role:"review",canPropose:true,canAccept:true,canReject:true} as const;
function receipt(index=1){const previousSuggestionId=id(index),suggestion={id:id(index+1),title:`Replacement ${index}`,author:"alice",createdAtMs:"18446744073709551615"},sequence=9007199254740993n+2n*BigInt(index);return {rootSuggestionId:id(1),revision:{id:id(index+1000),previousSuggestionId,suggestion},previousDecision:{sequence:String(sequence),principal:"alice",suggestionId:previousSuggestionId,decision:"reject" as const,effect:null},publication:{sequence:String(sequence+1n),suggestion}};}
const stored=receipt(),row={previousPacket:"exact native predecessor",packet:"exact native relation",retry:true,receipt:null,conflict:null};
const record={format:"breditor/shared-suggestion-revisions",formatVersion:1,identity,binding,retained:[row]};
describe("pure formatting revision capture",()=>{
 it("retains native bytes and does not infer ranges or edit commands in JavaScript",()=>{
  const result={kind:"captured",revisionPacketJson:"opaque native relation"},rebase=vi.fn(()=>result),queue={core:{readSuggestion:()=>({id:id(1),author:"alice"}),rebaseSuggestionFormat:rebase},packet:vi.fn(()=>"opaque predecessor"),identity:()=>identity,status:()=>({decision:null})};
  expect(captureFormatRevision(queue as never,{previousSuggestionId:id(1),title:"Rebased",createdAtMs:"9",revision:"7"})).toEqual({previousPacket:"opaque predecessor",result});expect(rebase).toHaveBeenCalledExactlyOnceWith("opaque predecessor","Rebased","9","7");
 });
 it("refuses final or foreign predecessors before native capture",()=>{
  for(const [author,decision] of [["bob",null],["alice",{decision:"reject"}]]){const rebase=vi.fn(),queue={core:{readSuggestion:()=>({id:id(1),author}),rebaseSuggestionFormat:rebase},packet:()=>"original",identity:()=>identity,status:()=>({decision})};expect(()=>captureFormatRevision(queue as never,{previousSuggestionId:id(1),title:"Rebased",createdAtMs:"0"})).toThrow("suggestion_revision_predecessor_final_or_foreign");expect(rebase).not.toHaveBeenCalled();}
 });
});
function page(rows:unknown[],after:string,through=after,more=false){return {kind:"suggestionRevisionsPage",page:{descriptor,permissions,revisions:rows,cursor:{binding,after,through},more}};}
describe("immutable revision metadata is not native source or authentication",()=>{
 it("pins the independent lane and original suggestion activation without authority extras",()=>{revisionsDescriptor(descriptor,binding,identity);for(const change of [{binding:"a".repeat(64)},{suggestionBinding:"a".repeat(64)},{document:"other"},{formatVersion:2},{principal:"alice"}])expect(()=>revisionsDescriptor({...descriptor,...change},binding,identity)).toThrow();});
 it("requires exact same-creator not-accepted supersession and adjacent original publication",()=>{
  expect(revisionReceipt(stored,identity)).toEqual(stored);expect(revisionInfo(stored.revision)).toEqual(stored.revision);
  for(const value of [{...stored,rootSuggestionId:stored.revision.suggestion.id},{...stored,revision:{...stored.revision,previousSuggestionId:stored.revision.suggestion.id}},{...stored,previousDecision:{...stored.previousDecision,decision:"accept"}},{...stored,previousDecision:{...stored.previousDecision,principal:"bob"}},{...stored,previousDecision:{...stored.previousDecision,suggestionId:id(99)}},{...stored,publication:{...stored.publication,sequence:stored.previousDecision.sequence}},{...stored,publication:{...stored.publication,suggestion:{...stored.publication.suggestion,title:"different"}}},{...stored,credential:"not authority"}])expect(()=>revisionReceipt(value,identity)).toThrow();
 });
 it("reconstructs bounded requests, discards caller authority and never selects ordinary child publication",()=>{
  expect(revisionRequest({kind:"suggestionRevisionPublish",previousSuggestionId:id(1),revisionPacket:"opaque",binding:"bad",principal:"bob"} as never,binding)).toEqual({kind:"suggestionRevisionPublish",revision:{binding,previousSuggestionId:id(1),revisionPacket:"opaque"}});
  expect(()=>revisionRequest({kind:"suggestionPublish",packet:"child"} as never,binding)).toThrow();expect(()=>revisionRequest({kind:"suggestionRevisionPublish",previousSuggestionId:id(1),revisionPacket:"€".repeat(710000)},binding)).toThrow("suggestion_revision_packet_budget");
 });
 it("uses a separate closed recovery family and retains exact losing bytes without requeueing finals",()=>{
  expect(checkRevisionRecord(record,identity,binding)).toEqual(record);const won={...record,retained:[{...row,retry:false,receipt:stored}]};expect(checkRevisionRecord(won,identity,binding).retained[0]!.receipt).toEqual(stored);
  for(const value of [{...record,format:"breditor/shared-suggestion-queue"},{...record,identity:{...identity,credential:"secret"}},{...record,retained:[{...row,receipt:stored}]},{...record,retained:[{...row,retry:false,receipt:stored,conflict:{decision:stored.previousDecision,successor:stored}}]},{...record,retained:Array.from({length:257},()=>row)},{...record,retained:[{...row,packet:"€".repeat(710000)}]}])expect(()=>checkRevisionRecord(value,identity,binding)).toThrow();
 });
});
describe("frozen immutable revision discovery",()=>{
 it("reads exact large sequence values, bounded pages, original roots and stable receipts",async()=>{
  const rows=Array.from({length:65},(_,n)=>receipt(n+1)),first=rows[63]!,last=rows[64]!,request=vi.fn().mockResolvedValueOnce(page(rows.slice(0,64),first.publication.sequence,last.publication.sequence,true)).mockResolvedValueOnce(page(rows.slice(64),last.publication.sequence));const feed=await readRevisionFeed(request,identity,binding);
  expect(feed.revisions.size).toBe(65);expect(request.mock.calls[1]![0].cursor).toEqual({binding,after:first.publication.sequence,through:last.publication.sequence});checkRevisionFeed(rows,feed.revisions);expect(()=>checkRevisionFeed([receipt(90)],feed.revisions)).toThrow("suggestion_revision_server_rollback");
 });
 it("refuses branches, skipped roots, duplicates, empty continuation and changed frozen cuts",async()=>{
  const branch={...receipt(2),revision:{...receipt(2).revision,previousSuggestionId:id(1)},previousDecision:{...receipt(2).previousDecision,suggestionId:id(1)}};
  for(const response of [page([stored,stored],stored.publication.sequence),page([stored,branch],branch.publication.sequence),page([{...stored,rootSuggestionId:id(77)}],stored.publication.sequence),page([stored],stored.previousDecision.sequence),page([],"3","4",true),{...page([],"3"),token:"bad"}])await expect(readRevisionFeed(vi.fn().mockResolvedValue(response),identity,binding)).rejects.toThrow();
  expect((await readRevisionFeed(vi.fn().mockResolvedValue(page([],"3")),identity,binding)).revisions.size).toBe(0);
 });
});
describe("one authenticated revision admission",()=>{
 it("retains the original durable outcome rather than reinterpreting a duplicate or ordinary publication",async()=>{
  const request=vi.fn().mockResolvedValue({kind:"suggestionRevisionAdmission",admission:{kind:"durable",descriptor,revision:stored,duplicate:true}});expect(await submitRevision(request,identity,binding,row,stored.revision)).toEqual({receipt:stored,conflict:null});expect(request).toHaveBeenCalledWith({kind:"suggestionRevisionPublish",previousSuggestionId:id(1),revisionPacket:row.packet});
  request.mockResolvedValue({kind:"suggestionAdmission",admission:{kind:"durable",publication:stored.publication}});await expect(submitRevision(request,identity,binding,row,stored.revision)).rejects.toThrow();
 });
 it("keeps pending separate and retains an intervening final decision without publishing the losing child",async()=>{
  const pending=vi.fn().mockResolvedValue({kind:"suggestionRevisionAdmission",admission:{kind:"pending",missing:[{writer:"303",counter:"4"}]}});expect(await submitRevision(pending,identity,binding,row,stored.revision)).toBe(null);
  const other=receipt(1),losing={...stored.revision,id:id(9999),suggestion:{...stored.revision.suggestion,id:id(9998)}};
  const request=vi.fn().mockResolvedValue({kind:"suggestionRevisionAdmission",admission:{kind:"conflict",previous:{publication:{sequence:"4",suggestion:{...stored.publication.suggestion,id:id(1)}},decision:other.previousDecision},successor:other}});
  expect(await submitRevision(request,identity,binding,row,losing)).toEqual({receipt:null,conflict:{decision:other.previousDecision,successor:other}});await expect(submitRevision(request,identity,binding,row,stored.revision)).rejects.toThrow("suggestion_revision_receipt_mismatch");
 });
});
