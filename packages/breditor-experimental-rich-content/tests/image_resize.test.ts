// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {mountRichImageResize,richImageResizeCommit,scaleRichImageSize,clampRichImageDimension,RICH_IMAGE_SIZE_MAX,RICH_IMAGE_SIZE_MIN,type RichImageResizeHost,type RichImageResizeHostState,type RichImageResizeRequest,type RichImageSize} from "../src/image_resize.js";
import {sharedImageResizeCommit} from "../../breditor-collaboration/src/image_resize.js";
import {resolveRichUi} from "../src/ui_locale.js";
import type {RichDomEditor} from "../src/controller.js";
import type {SharedDomEditor} from "../../breditor-collaboration/src/controller.js";

// Compile-time proof that the real local and shared DOM owners satisfy the borrowed port and commit shapes.
export const domPort=(dom:RichDomEditor|RichDomEditor<"document-v1">):RichImageResizeHost=>dom;
export const sharedPort=(dom:SharedDomEditor):RichImageResizeHost=>dom;
export const domCommit=(dom:RichDomEditor)=>richImageResizeCommit(dom);
export const sharedCommit=(dom:SharedDomEditor)=>sharedImageResizeCommit(dom);

interface Image {id:string;block:string;size:RichImageSize|null;rect:{left:number;top:number;width:number;height:number};natural?:RichImageSize}
const element=(type:string,properties:Record<string,unknown>,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties,children});
class FakeHost {
 readonly surface=document.createElement("div");
 state:RichImageResizeHostState={revision:"1",closed:false,busy:false,composing:false,readOnly:false};
 images:Image[]=[{id:"i1",block:"b1",size:{width:200,height:100},rect:{left:100,top:50,width:200,height:100}}];
 selection:unknown=null;
 rtl=false;
 listeners=new Set<()=>void>();
 commits:RichImageResizeRequest[]=[];
 views=0;
 constructor(){this.surface.contentEditable="true";this.render();}
 render(){
  this.surface.replaceChildren(...this.images.map(image=>{
   const figure=document.createElement("figure");figure.contentEditable="false";figure.dataset["richBlock"]=image.block;figure.dataset["richImage"]=image.id;
   const img=document.createElement("img");if(image.size){img.width=image.size.width;img.height=image.size.height;}
   const {left,top,width,height}=image.rect;img.getBoundingClientRect=()=>({left,top,width,height,right:left+width,bottom:top+height,x:left,y:top,toJSON(){}}) as DOMRect;
   if(image.natural){Object.defineProperty(img,"naturalWidth",{value:image.natural.width});Object.defineProperty(img,"naturalHeight",{value:image.natural.height});}
   const caption=document.createElement("figcaption");caption.append(document.createElement("img"));// caption content is never measured
   figure.append(img,caption);return figure;
  }));
 }
 writingState(){return this.state;}
 subscribeWriting(l:()=>void){this.listeners.add(l);return()=>this.listeners.delete(l);}
 view(){
  this.views++;
  const root=element("document",{"breditor/block-id":"root"},[element("paragraph",{"breditor/block-id":"p"}),...this.images.map(image=>element("image",{"breditor/block-id":image.block,"breditor/image-id":image.id,...(image.size?{"breditor/width":image.size.width,"breditor/height":image.size.height}:{})}))]);
  return {revision:this.state.revision,documentJson:JSON.stringify({root}),selection:this.selection};
 }
 /** Simulates one owner publication (local or remote). */
 publish(mutate:()=>void){mutate();this.state={...this.state,revision:String(Number(this.state.revision)+1)};this.render();for(const l of [...this.listeners])l();}
 commit=(request:RichImageResizeRequest)=>{this.commits.push(request);this.publish(()=>{this.images=this.images.map(image=>image.id===request.image?{...image,size:request.size,rect:{...image.rect,width:request.size.width,height:request.size.height}}:image);});};
}

const pointer=(type:string,clientX:number,clientY:number,init:PointerEventInit={})=>{
 const Ctor=(window as unknown as {PointerEvent?:typeof PointerEvent}).PointerEvent;
 if(Ctor)return new Ctor(type,{bubbles:true,cancelable:true,clientX,clientY,pointerId:1,button:0,isPrimary:true,...init});
 const event=new MouseEvent(type,{bubbles:true,cancelable:true,clientX,clientY,button:0,shiftKey:init.shiftKey??false});Object.assign(event,{pointerId:1,isPrimary:true,pointerType:"mouse"});return event;
};
const drag=(target:HTMLElement,from:[number,number],to:[number,number],init:PointerEventInit={})=>{
 target.dispatchEvent(pointer("pointerdown",...from));
 target.dispatchEvent(pointer("pointermove",(from[0]+to[0])/2,(from[1]+to[1])/2,init));
 target.dispatchEvent(pointer("pointermove",...to,init));
};
const key=(target:HTMLElement,k:string,init:KeyboardEventInit={})=>target.dispatchEvent(new KeyboardEvent("keydown",{key:k,bubbles:true,cancelable:true,...init}));

let host:FakeHost,overlay:HTMLElement;
beforeEach(()=>{host=new FakeHost();overlay=document.createElement("div");document.body.replaceChildren(host.surface,overlay);});
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();});
const sliders=()=>[...overlay.querySelectorAll<HTMLElement>("[role=slider]")];
const edge=(kind:"inline-end"|"block-end",index=0)=>overlay.querySelectorAll<HTMLElement>(`[data-image-resize-handle=${kind}]`)[index]!;
const size=(w:number,h:number)=>({width:w,height:h});

describe("dimension policy",()=>{
 it("clamps each axis to the admitted 1..4096 domain",()=>{
  expect([clampRichImageDimension(0.2),clampRichImageDimension(-9),clampRichImageDimension(4096.4),clampRichImageDimension(99999)]).toEqual([RICH_IMAGE_SIZE_MIN,1,RICH_IMAGE_SIZE_MAX,4096]);
  expect(()=>clampRichImageDimension(Number.NaN)).toThrow(RangeError);
 });
 it("scales proportionally and limits the factor so neither axis leaves the domain",()=>{
  expect(scaleRichImageSize(size(200,100),1.2)).toEqual(size(240,120));
  expect(scaleRichImageSize(size(200,100),Infinity)).toEqual(size(4096,2048));
  expect(scaleRichImageSize(size(200,100),0)).toEqual(size(2,1));
  expect(scaleRichImageSize(size(4096,1),2)).toEqual(size(4096,1));
  expect(()=>scaleRichImageSize(size(1,1),Number.NaN)).toThrow(RangeError);
 });
});

describe("image resize handles",()=>{
 it("exposes one focusable slider per image outside editable content",()=>{
  mountRichImageResize(overlay,host,{commit:host.commit});
  const [slider]=sliders();
  expect(sliders()).toHaveLength(1);expect(slider!.tabIndex).toBe(0);
  expect(slider!.getAttribute("aria-label")).toBe("Resize image 1 of 1");
  expect(slider!.getAttribute("aria-valuenow")).toBe("200");
  expect(slider!.getAttribute("aria-valuetext")).toBe("200 by 100 pixels");
  expect(slider!.getAttribute("aria-valuemin")).toBe("2");expect(slider!.getAttribute("aria-valuemax")).toBe("4096");
  expect(slider!.getAttribute("aria-disabled")).toBe("false");
  expect(slider!.style.left).toBe("300px");expect(slider!.style.top).toBe("150px");
  expect(edge("inline-end").getAttribute("aria-hidden")).toBe("true");expect(edge("inline-end").style.left).toBe("300px");
  expect(edge("block-end").style.top).toBe("150px");expect(edge("block-end").style.left).toBe("100px");
  expect(host.surface.contains(slider!)).toBe(false);
 });

 it("rejects an overlay inside editable content and a missing commit",()=>{
  const inside=document.createElement("div");host.surface.append(inside);
  expect(()=>mountRichImageResize(inside,host,{commit:host.commit})).toThrow(/outside editable content/);
  expect(()=>mountRichImageResize(overlay,host,{} as never)).toThrow(/explicit commit/);
  expect(()=>mountRichImageResize(overlay,host,{commit:host.commit,step:0})).toThrow(/positive integer step/);
 });

 it("previews a corner drag with the aspect ratio kept, then commits exactly once on release",()=>{
  const resize=mountRichImageResize(overlay,host,{commit:host.commit});const corner=sliders()[0]!;
  const before=host.surface.innerHTML;
  drag(corner,[300,150],[340,155]);
  expect(resize.preview()).toEqual({image:"i1",handle:"corner",start:size(200,100),size:size(240,120),free:false});
  expect(host.commits).toHaveLength(0);expect(host.surface.innerHTML).toBe(before);
  const outline=overlay.querySelector<HTMLElement>("[data-image-resize-outline]")!,badge=overlay.querySelector<HTMLElement>("[data-image-resize-badge]")!;
  expect(outline.hidden).toBe(false);expect([outline.style.left,outline.style.top,outline.style.width,outline.style.height]).toEqual(["100px","50px","240px","120px"]);
  expect(badge.textContent).toBe("240 × 120");expect(corner.getAttribute("aria-valuetext")).toBe("240 by 120 pixels (preview)");
  corner.dispatchEvent(pointer("pointerup",340,155));
  expect(host.commits).toEqual([{image:"i1",block:"b1",size:size(240,120),revision:"1"}]);
  expect(resize.preview()).toBeNull();expect(outline.hidden).toBe(true);expect(badge.hidden).toBe(true);
  expect(sliders()[0]!.getAttribute("aria-valuenow")).toBe("240");expect(sliders()[0]!.getAttribute("aria-valuetext")).toBe("240 by 120 pixels");
 });

 it("follows the axis that moved further, and Shift resizes freely",()=>{
  const resize=mountRichImageResize(overlay,host,{commit:host.commit});const corner=sliders()[0]!;
  drag(corner,[300,150],[305,200]);// height grows 50%: width follows
  expect(resize.preview()!.size).toEqual(size(300,150));
  corner.dispatchEvent(pointer("pointermove",340,180,{shiftKey:true}));
  expect(resize.preview()).toMatchObject({size:size(240,130),free:true});
  corner.dispatchEvent(pointer("pointerup",340,180,{shiftKey:true}));
  expect(host.commits.map(c=>c.size)).toEqual([size(240,130)]);
 });

 it("edge handles change one axis",()=>{
  mountRichImageResize(overlay,host,{commit:host.commit});
  drag(edge("inline-end"),[300,100],[260,140]);edge("inline-end").dispatchEvent(pointer("pointerup",260,140));
  expect(host.commits.at(-1)!.size).toEqual(size(160,100));
  drag(edge("block-end"),[150,150],[400,175]);edge("block-end").dispatchEvent(pointer("pointerup",400,175));
  expect(host.commits.at(-1)!.size).toEqual(size(160,125));
  expect(host.commits).toHaveLength(2);
 });

 it("clamps drags to the admitted domain",()=>{
  mountRichImageResize(overlay,host,{commit:host.commit});
  drag(sliders()[0]!,[300,150],[99999,150]);sliders()[0]!.dispatchEvent(pointer("pointerup",99999,150));
  expect(host.commits.at(-1)!.size).toEqual(size(4096,2048));
  host.publish(()=>{host.images=[{...host.images[0]!,size:size(200,100),rect:{left:100,top:50,width:200,height:100}}];});
  drag(sliders()[0]!,[300,150],[-9999,-9999],{shiftKey:true});sliders()[0]!.dispatchEvent(pointer("pointerup",-9999,-9999,{shiftKey:true}));
  expect(host.commits.at(-1)!.size).toEqual(size(1,1));
 });

 it("divides pointer deltas by the rendered scale of a shrunk image",()=>{
  host.publish(()=>{host.images=[{...host.images[0]!,size:size(1000,100),rect:{left:0,top:0,width:500,height:100}}];});
  mountRichImageResize(overlay,host,{commit:host.commit});
  drag(edge("inline-end"),[500,50],[450,50]);edge("inline-end").dispatchEvent(pointer("pointerup",450,50));
  expect(host.commits.at(-1)!.size).toEqual(size(900,100));
 });

 it("does not commit an unchanged size",()=>{
  mountRichImageResize(overlay,host,{commit:host.commit});const corner=sliders()[0]!;
  drag(corner,[300,150],[300.2,150.1]);corner.dispatchEvent(pointer("pointerup",300.2,150.1));
  expect(host.commits).toHaveLength(0);
 });

 it("cancels on Escape, blur and pointercancel without committing",()=>{
  const onCancel=vi.fn();
  mountRichImageResize(overlay,host,{commit:host.commit,onCancel});const corner=sliders()[0]!;
  drag(corner,[300,150],[340,150]);key(corner,"Escape");corner.dispatchEvent(pointer("pointerup",340,150));
  drag(edge("block-end"),[150,150],[150,190]);document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));edge("block-end").dispatchEvent(pointer("pointerup",150,190));
  drag(corner,[300,150],[340,150]);corner.dispatchEvent(new FocusEvent("blur"));corner.dispatchEvent(pointer("pointerup",340,150));
  drag(corner,[300,150],[340,150]);corner.dispatchEvent(pointer("pointercancel",340,150));corner.dispatchEvent(pointer("pointerup",340,150));
  drag(corner,[300,150],[340,150]);window.dispatchEvent(new FocusEvent("blur"));corner.dispatchEvent(pointer("pointerup",340,150));
  expect(host.commits).toHaveLength(0);
  expect(onCancel.mock.calls.map(c=>c[0])).toEqual(["escape","escape","blur","pointer-cancel","blur"]);
 });

 it("cancels when a publication changes or removes the dragged image, but not for unrelated edits",()=>{
  const onCancel=vi.fn();
  const resize=mountRichImageResize(overlay,host,{commit:host.commit,onCancel});const corner=sliders()[0]!;
  drag(corner,[300,150],[340,150]);
  host.publish(()=>{host.selection={kind:"text"};});// unrelated remote edit or selection change
  expect(resize.preview()?.size).toEqual(size(240,120));
  corner.dispatchEvent(pointer("pointerup",340,150));
  expect(host.commits).toEqual([{image:"i1",block:"b1",size:size(240,120),revision:"2"}]);
  const next=sliders()[0]!;
  drag(next,[340,170],[380,170]);
  host.publish(()=>{host.images=[{...host.images[0]!,size:size(50,50)}];});// remote resize of the same image
  expect(resize.preview()).toBeNull();
  next.dispatchEvent(pointer("pointerup",380,170));
  drag(next,[150,150],[180,150]);
  host.publish(()=>{host.images=[];});
  expect(resize.preview()).toBeNull();expect(sliders()).toHaveLength(0);
  expect(host.commits).toHaveLength(1);
  expect(onCancel.mock.calls.map(c=>c[0])).toEqual(["image-changed","image-changed"]);
 });

 it("cancels on read-only and composition",()=>{
  const onCancel=vi.fn();
  mountRichImageResize(overlay,host,{commit:host.commit,onCancel});
  drag(sliders()[0]!,[300,150],[340,150]);host.publish(()=>{host.state={...host.state,composing:true};});
  sliders()[0]!.dispatchEvent(pointer("pointerup",340,150));
  host.publish(()=>{host.state={...host.state,composing:false};});
  drag(sliders()[0]!,[300,150],[340,150]);host.publish(()=>{host.state={...host.state,readOnly:true};});
  expect(host.commits).toHaveLength(0);expect(sliders()).toHaveLength(0);
  expect(onCancel.mock.calls.map(c=>c[0])).toEqual(["unavailable","unavailable"]);
 });

 it("steps with arrows, Shift, PageUp/PageDown, Home and End keeping the aspect ratio; each key is one command",()=>{
  mountRichImageResize(overlay,host,{commit:host.commit});
  const at=()=>sliders()[0]!;
  key(at(),"ArrowRight");expect(host.commits.at(-1)!.size).toEqual(size(208,104));
  key(at(),"ArrowLeft",{shiftKey:true});expect(host.commits.at(-1)!.size).toEqual(size(144,72));
  key(at(),"ArrowUp");expect(host.commits.at(-1)!.size).toEqual(size(152,76));
  key(at(),"ArrowDown");expect(host.commits.at(-1)!.size).toEqual(size(144,72));
  key(at(),"PageUp");expect(host.commits.at(-1)!.size).toEqual(size(208,104));
  key(at(),"PageDown");expect(host.commits.at(-1)!.size).toEqual(size(144,72));
  key(at(),"Home");expect(host.commits.at(-1)!.size).toEqual(size(2,1));
  key(at(),"ArrowLeft");expect(host.commits).toHaveLength(7);// already at the minimum
  key(at(),"End");expect(host.commits.at(-1)!.size).toEqual(size(4096,2048));
  key(at(),"x");key(at(),"ArrowRight",{ctrlKey:true});
  expect(host.commits).toHaveLength(8);
  expect(new Set(host.commits.map(c=>c.revision)).size).toBe(8);
 });

 it("keeps focus on the same slider element across publications",()=>{
  mountRichImageResize(overlay,host,{commit:host.commit});const slider=sliders()[0]!;slider.focus();
  key(slider,"ArrowRight");
  expect(sliders()[0]).toBe(slider);expect(document.activeElement).toBe(slider);
 });

 it("lays handles out from the inline-end in right-to-left content; ArrowLeft and leftward drags grow",()=>{
  const style=window.getComputedStyle;
  vi.spyOn(window,"getComputedStyle").mockImplementation(((node:Element)=>node instanceof HTMLElement&&node.tagName==="FIGURE"?{direction:"rtl"} as CSSStyleDeclaration:style(node)) as typeof window.getComputedStyle);
  const resize=mountRichImageResize(overlay,host,{commit:host.commit});const slider=sliders()[0]!;
  expect(slider.style.left).toBe("100px");expect(edge("inline-end").style.left).toBe("100px");expect(edge("block-end").style.left).toBe("108px");
  key(slider,"ArrowLeft");expect(host.commits.at(-1)!.size).toEqual(size(208,104));
  key(sliders()[0]!,"ArrowRight");expect(host.commits.at(-1)!.size).toEqual(size(200,100));
  drag(sliders()[0]!,[100,150],[60,150]);
  expect(resize.preview()!.size).toEqual(size(240,120));
  const outline=overlay.querySelector<HTMLElement>("[data-image-resize-outline]")!;expect(outline.style.left).toBe("60px");expect(outline.style.width).toBe("240px");
  resize.cancel();
 });

 it("disables while busy or composing and when an unsized image has no intrinsic size yet",()=>{
  mountRichImageResize(overlay,host,{commit:host.commit});
  host.publish(()=>{host.state={...host.state,busy:true};});
  expect(sliders()[0]!.getAttribute("aria-disabled")).toBe("true");
  key(sliders()[0]!,"ArrowRight");drag(sliders()[0]!,[300,150],[340,150]);sliders()[0]!.dispatchEvent(pointer("pointerup",340,150));
  expect(host.commits).toHaveLength(0);
  host.publish(()=>{host.state={...host.state,busy:false};host.images=[{id:"i2",block:"b2",size:null,rect:{left:0,top:0,width:40,height:30}}];});
  expect(sliders()[0]!.getAttribute("aria-disabled")).toBe("true");expect(sliders()[0]!.hasAttribute("aria-valuenow")).toBe(false);
  key(sliders()[0]!,"ArrowRight");expect(host.commits).toHaveLength(0);
 });

 it("starts an unsized image from its intrinsic size",()=>{
  host.images=[{id:"i2",block:"b2",size:null,rect:{left:0,top:0,width:320,height:160},natural:size(640,320)}];host.render();
  mountRichImageResize(overlay,host,{commit:host.commit});
  expect(sliders()[0]!.getAttribute("aria-valuetext")).toBe("640 by 320 pixels (original size)");
  key(sliders()[0]!,"ArrowLeft");
  expect(host.commits).toEqual([{image:"i2",block:"b2",size:size(632,316),revision:"1"}]);
 });

 it("labels images in document order, marks the selected image and tracks hover",()=>{
  host.images.push({id:"i2",block:"b2",size:size(50,50),rect:{left:0,top:300,width:50,height:50}});host.render();
  const resize=mountRichImageResize(overlay,host,{commit:host.commit,label:(index,count,image)=>`${image} ${index}/${count}`});
  expect(sliders().map(s=>s.getAttribute("aria-label"))).toEqual(["i1 0/2","i2 1/2"]);
  const groups=()=>[...overlay.querySelectorAll<HTMLElement>("[data-image-resize-group]")];
  host.publish(()=>{host.selection={kind:"node",block:"b2"};});
  expect(groups().map(g=>g.hasAttribute("data-selected"))).toEqual([false,true]);
  document.dispatchEvent(pointer("pointermove",150,80,{pointerType:"mouse"}));
  expect(groups().map(g=>g.hasAttribute("data-hover"))).toEqual([true,false]);
  document.dispatchEvent(pointer("pointermove",310,160,{pointerType:"mouse"}));// within the handle margin
  expect(groups()[0]!.hasAttribute("data-hover")).toBe(true);
  document.dispatchEvent(pointer("pointermove",700,700,{pointerType:"mouse"}));
  expect(groups().some(g=>g.hasAttribute("data-hover"))).toBe(false);
  resize.dispose();
 });

 it("uses the host catalog for names, values and the badge direction",()=>{
  (host as unknown as {uiLocale:()=>unknown}).uiLocale=()=>resolveRichUi({lang:"ar",direction:"rtl",strings:{imageResizeLabel:"صورة {index} من {count}",imageResizeValue:"{width}×{height}"}});
  mountRichImageResize(overlay,host,{commit:host.commit});
  expect(sliders()[0]!.getAttribute("aria-label")).toBe("صورة 1 من 1");expect(sliders()[0]!.getAttribute("aria-valuetext")).toBe("200×100");
  const badge=overlay.querySelector<HTMLElement>("[data-image-resize-badge]")!;expect(badge.dir).toBe("rtl");expect(badge.lang).toBe("ar");
  expect(()=>resolveRichUi({strings:{imageResizeBadge:"{depth}"}})).toThrow("unknown placeholder {depth}");
 });

 it("removes everything on dispose and frees the overlay",()=>{
  const resize=mountRichImageResize(overlay,host,{commit:host.commit});
  resize.dispose();resize.dispose();
  expect(overlay.children).toHaveLength(0);expect(host.listeners.size).toBe(0);
  // The overlay is free again once disposed.
  mountRichImageResize(overlay,host,{commit:host.commit}).dispose();
 });

 it("maps requests to the local resizeImage and shared resize_image commands",()=>{
  const execute=vi.fn(),request={image:"i1",block:"b1",size:size(320,240),revision:"7"};
  richImageResizeCommit({execute})(request);
  expect(execute).toHaveBeenCalledWith({kind:"resizeImage",data:{image:"i1",size:{width:320,height:240}}},false,"7");
  const shared=vi.fn();sharedImageResizeCommit({execute:shared})(request);
  expect(shared).toHaveBeenCalledWith({commands:[{kind:"resize_image",data:{block:"b1",size:[320,240]}}]},false,"7");
  expect(()=>sharedImageResizeCommit({execute:shared})({...request,block:""})).toThrow(/block id/);
 });
});
