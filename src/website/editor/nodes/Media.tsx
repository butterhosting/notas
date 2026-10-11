import { Media as MediaModel } from "@/models/Media";
import { ProblemDetails } from "@/models/internal/ProblemDetails";
import { MediaClient } from "@/website/clients/MediaClient";
import { Popover } from "@/website/comps/Popover";
import { Embed as EmbedLink } from "@/website/helpers/Embed";
import { useRegistry } from "@/website/hooks/useRegistry";
import { useWorkspaces } from "@/website/hooks/useWorkspaces";
import { mergeAttributes, Node } from "@tiptap/core";
import TiptapImage from "@tiptap/extension-image";
import { NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { Directive } from "../markdown/Directive";
import { Icon } from "@/website/comps/Icon";

// an empty block is stored too (a bare `::video`), so a half-made block survives a reload
export namespace Media {
  export type Kind = "image" | "video" | "audio" | "file" | "embed";

  export const Image = TiptapImage.extend({
    draggable: false,

    addNodeView() {
      return ReactNodeViewRenderer(MediaView);
    },

    markdownTokenizer: Directive.leaf("image"),

    parseMarkdown(token, h) {
      if ("attributes" in token) {
        return h.createNode("image", { src: null, ...(token as Directive.Token).attributes });
      }
      return this.parent!(token, h);
    },

    renderMarkdown(node, h, ctx) {
      return node.attrs?.src ? this.parent!(node, h, ctx) : Directive.renderLeaf("image", {});
    },
  }).configure({ allowBase64: false });

  export const Video = leaf("video", ["src"]);
  export const Audio = leaf("audio", ["src"]);
  export const File = leaf("file", ["src", "name", "size"]);
  export const Embed = leaf("embed", ["src"]);

  export const ALL = [Image, Video, Audio, File, Embed];

  export function kindOf(mime: string): Exclude<Kind, "embed"> {
    const [type] = mime.split("/");
    return type === "image" || type === "video" || type === "audio" ? type : "file";
  }

  export function attributesOf(media: MediaModel): Record<string, unknown> {
    return kindOf(media.mime) === "file" ? { src: media.url, name: media.filename, size: media.size } : { src: media.url };
  }

  function leaf(name: Exclude<Kind, "image">, attributes: string[]) {
    return Node.create({
      name,
      group: "block",
      atom: true,
      selectable: true,

      addAttributes() {
        return Object.fromEntries(attributes.map((attribute) => [attribute, { default: null }]));
      },

      parseHTML() {
        return [{ tag: `div[data-type="${name}"]` }];
      },

      renderHTML({ HTMLAttributes }) {
        return ["div", mergeAttributes(HTMLAttributes, { "data-type": name })];
      },

      addNodeView() {
        return ReactNodeViewRenderer(MediaView);
      },

      markdownTokenizer: Directive.leaf(name),

      parseMarkdown(token, h) {
        return h.createNode(name, (token as Directive.Token).attributes);
      },

      renderMarkdown(node) {
        return Directive.renderLeaf(name, Object.fromEntries(attributes.map((attribute) => [attribute, node.attrs?.[attribute]])));
      },
    });
  }
}

const PLACEHOLDERS: Record<Media.Kind, { label: string; accept?: string }> = {
  image: { label: "Add an image", accept: "image/*" },
  video: { label: "Embed or upload a video", accept: "video/*" },
  audio: { label: "Add audio", accept: "audio/*" },
  file: { label: "Upload or embed a file" },
  embed: { label: "Embed a link" },
};

function MediaView(props: NodeViewProps) {
  const kind = props.extension.name as Media.Kind;
  return (
    <NodeViewWrapper className="block" data-type={kind}>
      {props.node.attrs.src ? <MediaContent kind={kind} src={props.node.attrs.src} attrs={props.node.attrs} /> : <MediaPlaceholder {...props} />}
    </NodeViewWrapper>
  );
}

const VISUAL = "mx-auto block max-h-[80vh] max-w-full rounded";
const FRAME = "aspect-video w-full rounded border-0 bg-c-block";

function MediaContent({ kind, src, attrs }: { kind: Media.Kind; src: string; attrs: Record<string, any> }) {
  switch (kind) {
    case "image":
      return <img src={src} alt={attrs.alt ?? ""} draggable={false} className={VISUAL} />;
    case "video": {
      const embed = EmbedLink.videoUrl(src);
      return embed ? <iframe src={embed} allowFullScreen className={FRAME} /> : <video src={src} controls preload="metadata" className={VISUAL} />;
    }
    case "audio":
      return <audio src={src} controls preload="metadata" className="w-full" />;
    case "file":
      return (
        <a href={src} download={attrs.name ?? true} className="flex items-center gap-2 rounded px-1 py-1.5 no-underline hover:bg-c-hover" contentEditable={false}>
          <Icon.File className="size-5 shrink-0" />
          <span className="truncate">{attrs.name ?? src}</span>
          {attrs.size && <span className="text-c-dark-half text-sm">{formatSize(Number(attrs.size))}</span>}
        </a>
      );
    case "embed":
      return <iframe src={EmbedLink.url(src)} allowFullScreen className={FRAME} />;
  }
}

function MediaPlaceholder({ node, updateAttributes, editor, selected, ...props }: NodeViewProps) {
  const kind = props.extension.name as Media.Kind;
  const mediaClient = useRegistry(MediaClient);
  const workspace = useWorkspaces().current;
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  // just inserted from the menu (and so selected): ask for the file right away
  const [open, setOpen] = useState(selected);
  const [tab, setTab] = useState<"upload" | "link">(kind === "embed" ? "link" : "upload");
  const [link, setLink] = useState("");
  const [progress, setProgress] = useState<number>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!editor.isEditable) setOpen(false);
  }, [editor.isEditable]);

  async function upload(file: File) {
    try {
      setError(undefined);
      setProgress(0);
      const media = await mediaClient.upload(workspace!.id, file, setProgress);
      updateAttributes(Media.attributesOf(media));
    } catch (e) {
      setError(ProblemDetails.isInstance(e) ? e.problem : String(e));
    } finally {
      setProgress(undefined);
    }
  }

  function embed() {
    if (link.trim()) {
      updateAttributes(kind === "file" ? { src: link.trim(), name: link.trim().split("/").pop() } : { src: link.trim() });
    }
  }

  const { label, accept } = PLACEHOLDERS[kind];
  return (
    <>
      <button ref={setAnchor} contentEditable={false} onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded bg-c-callout px-3.5 py-3 text-left text-c-dark-half hover:bg-c-hover"
      >
        <MediaIcon kind={kind} />
        {progress === undefined ? label : `Uploading… ${Math.round(progress * 100)}%`}
      </button>
      {open && progress === undefined && (
        <Popover anchor={anchor} onClose={() => setOpen(false)} className="w-[420px] p-1">
          <div className="flex gap-1 border-b border-c-hover px-1 pb-1 text-sm">
            {kind !== "embed" && (
              <button onClick={() => setTab("upload")} className={clsx("rounded px-2 py-1 hover:bg-c-hover", tab === "upload" && "font-semibold")}>
                Upload
              </button>
            )}
            <button onClick={() => setTab("link")} className={clsx("rounded px-2 py-1 hover:bg-c-hover", tab === "link" && "font-semibold")}>
              {kind === "embed" ? "Link" : "Embed link"}
            </button>
          </div>
          <div className="flex flex-col gap-2 p-3">
            {tab === "upload" ? (
              <label className="cursor-pointer rounded-md border border-c-hover px-3 py-2 text-center text-sm hover:bg-c-hover">
                Choose a file
                <input
                  type="file"
                  accept={accept}
                  className="hidden"
                  aria-label="upload file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setOpen(false);
                      upload(file);
                    }
                  }}
                />
              </label>
            ) : (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  embed();
                }}
              >
                <input
                  autoFocus
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder={kind === "video" || kind === "embed" ? "Paste a YouTube, Vimeo or any other link…" : "Paste a link…"}
                  className="rounded-md bg-c-hover px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-c-accent/40"
                />
                <button type="submit" className="rounded-md bg-c-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-c-accent/90">
                  Embed
                </button>
              </form>
            )}
            <span className="text-xs text-c-dark-half">{kind === "image" ? "Tip: you can also paste or drop images straight into the page." : " "}</span>
          </div>
        </Popover>
      )}
      {error && <div className="mt-1 text-sm text-c-error">{error}</div>}
    </>
  );
}

function MediaIcon({ kind }: { kind: Media.Kind }) {
  const Component = { image: Icon.Image, video: Icon.Video, audio: Icon.Audio, file: Icon.File, embed: Icon.Embed }[kind];
  return <Component className="size-5" />;
}

function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)));
  return `${(bytes / 1024 ** exponent).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
}
