import type {FlowDraft, FlowPosition} from "../core.js";
import type {RichDomEditor} from "../controller.js";
import type {RichAssetStore} from "./store.js";
import type {AssetInfo} from "./types.js";

/** Store all selected files before one atomic document insertion at the captured stable parent. */
export async function insertImageFiles(editor: RichDomEditor, store: RichAssetStore,
  files: readonly File[], position: FlowPosition): Promise<readonly AssetInfo[]> {
  if (!files.length || files.length > 16) throw Error("Select 1–16 image files per insertion");
  const policy=editor.view();if(policy.readOnly===true)throw Error("The rich editor is read-only");
  // Clone the target before asynchronous admission; callers cannot mutate prepared work.
  const selected=[...files],target = structuredClone(position), assets: AssetInfo[] = [], blocks: FlowDraft[] = [];
  const prefix = `files:${crypto.randomUUID()}`;
  for (const [index, file] of selected.entries()) {
    const admitted = await store.ingest(file); assets.push(admitted);
    blocks.push({kind: "image", block: `${prefix}:block:${index}`, image: `${prefix}:image:${index}`,
      asset: admitted.asset, generation: `${prefix}:generation:${index}`,
      alt: {kind: "description", text: file.name || "Image"}, size: {width: admitted.width, height: admitted.height}, caption: null});
  }
  // Rust revalidates the stable position against the current admitted document.
  // An invalid/deleted target fails without partial insertion; durable files remain exportable.
  if(editor.view().readOnly===true||editor.view().readOnlyRevision!==policy.readOnlyRevision)throw Error("Editing policy changed before image insertion");
  editor.execute({kind: "insertBlocks", data: {position: target, blocks}}, false);
  return assets;
}
