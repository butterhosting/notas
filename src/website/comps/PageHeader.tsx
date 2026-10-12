import { Page } from "@/models/Page";
import { ProblemDetails } from "@/models/internal/ProblemDetails";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { MediaClient } from "../clients/MediaClient";
import { Cover } from "../helpers/Cover";
import { useRegistry } from "../hooks/useRegistry";
import { useWorkspaces } from "../hooks/useWorkspaces";
import { EmojiPicker } from "./EmojiPicker";
import { Icon } from "./Icon";
import { Popover } from "./Popover";

type Meta = Pick<Page, "title" | "icon" | "cover">;

type Props = Meta & {
  autoFocus?: boolean;
  readOnly?: boolean;
  onChange: (patch: { title?: string; icon?: string | null; cover?: Page.Cover | null }) => void;
  onEnter: () => void;
};

export function PageHeader({ title, icon, cover, autoFocus, readOnly, onChange, onEnter }: Props) {
  const [iconAnchor, setIconAnchor] = useState<HTMLElement | null>(null);
  const [picking, setPicking] = useState(false);

  return (
    <div className="group/header">
      {cover && <PageCover cover={cover} readOnly={readOnly} onChange={(next) => onChange({ cover: next })} />}
      <div className="mx-auto w-full max-w-[900px] px-24 md:px-6">
        {icon && (
          <button
            ref={setIconAnchor}
            aria-label="page icon"
            disabled={readOnly}
            onClick={() => setPicking(true)}
            className={clsx(
              "relative z-[1] -ml-1 flex size-[78px] items-center justify-center rounded-md text-[70px] leading-none hover:bg-c-hover",
              cover ? "-mt-[42px] mb-2" : "mt-20 mb-2 md:mt-10",
            )}
          >
            {icon}
          </button>
        )}
        {(!icon || !cover) && !readOnly && (
          <div
            className={clsx(
              "flex h-9 items-end gap-1 text-sm text-c-dark-half opacity-0 transition-opacity group-hover/header:opacity-100 pointer-coarse:opacity-100",
              !icon && !cover && "mt-20 md:mt-6",
              !icon && cover && "mt-4",
            )}
          >
            {!icon && (
              <button
                ref={setIconAnchor}
                onClick={() => onChange({ icon: EmojiPicker.random() })}
                className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-c-hover"
              >
                <Icon.Smile /> Add icon
              </button>
            )}
            {!cover && (
              <button onClick={() => onChange({ cover: Cover.random() })} className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-c-hover">
                <Icon.Image /> Add cover
              </button>
            )}
          </div>
        )}
        {picking && (
          <Popover anchor={iconAnchor} onClose={() => setPicking(false)}>
            <EmojiPicker
              onSelect={(next) => {
                onChange({ icon: next });
                setPicking(false);
              }}
              onRemove={() => {
                onChange({ icon: null });
                setPicking(false);
              }}
            />
          </Popover>
        )}
        {!icon && !cover && readOnly && <div className="mt-20 md:mt-10" />}
        <Title title={title} autoFocus={autoFocus} readOnly={readOnly} onChange={(next) => onChange({ title: next })} onEnter={onEnter} />
      </div>
    </div>
  );
}

type TitleProps = { title: string; autoFocus?: boolean; readOnly?: boolean; onChange: (title: string) => void; onEnter: () => void };
function Title({ title, autoFocus, readOnly, onChange, onEnter }: TitleProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = ref.current!;
    element.style.height = "0";
    element.style.height = `${element.scrollHeight}px`;
  }, [title]);
  return (
    <textarea
      ref={ref}
      rows={1}
      autoFocus={autoFocus}
      readOnly={readOnly}
      value={title}
      aria-label="page title"
      placeholder="Untitled"
      onChange={(e) => onChange(e.target.value.replaceAll("\n", " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || (e.key === "ArrowDown" && e.currentTarget.selectionStart === title.length)) {
          e.preventDefault();
          onEnter();
        }
      }}
      className="mt-1 mb-6 block w-full resize-none overflow-hidden bg-transparent text-[40px] leading-[1.2] font-bold outline-none md:text-[32px] placeholder:text-c-placeholder-title"
    />
  );
}

function PageCover({ cover, readOnly, onChange }: { cover: Page.Cover; readOnly?: boolean; onChange: (cover: Page.Cover | null) => void }) {
  const [changeAnchor, setChangeAnchor] = useState<HTMLButtonElement | null>(null);
  const [changing, setChanging] = useState(false);
  const [repositioning, setRepositioning] = useState<number>();
  const ref = useRef<HTMLDivElement>(null);
  const preset = cover.src.startsWith("preset:");
  const y = repositioning ?? cover.y;

  function startDrag(e: React.PointerEvent) {
    if (repositioning === undefined) return;
    const startY = e.clientY;
    const startFocus = repositioning;
    const height = ref.current!.offsetHeight;
    const onMove = (move: PointerEvent) => {
      // dragging the image down reveals more of its top
      setRepositioning(Math.min(100, Math.max(0, startFocus - ((move.clientY - startY) / height) * 100)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      ref={ref}
      data-testid="page-cover"
      onPointerDown={startDrag}
      className={clsx(
        "group/cover relative h-[30vh] max-h-[280px] min-h-[160px] w-full md:h-[22vh] md:min-h-[120px]",
        repositioning !== undefined && "cursor-move touch-none select-none",
      )}
      style={Cover.style({ ...cover, y })}
    >
      {repositioning !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="rounded bg-black/40 px-3 py-1 text-sm text-white">Drag image to reposition</span>
        </div>
      )}
      <div
        hidden={readOnly}
        className={clsx(
          "absolute right-4 bottom-3 flex overflow-hidden rounded-md bg-c-surface/90 text-xs text-c-dark-half shadow-sm transition-opacity",
          repositioning === undefined && !changing && "opacity-0 group-hover/cover:opacity-100 pointer-coarse:opacity-100",
        )}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {repositioning === undefined ? (
          <>
            <button ref={setChangeAnchor} onClick={() => setChanging(true)} className="px-2.5 py-1.5 hover:bg-c-hover">
              Change cover
            </button>
            {!preset && (
              <button onClick={() => setRepositioning(cover.y)} className="border-l border-c-hover px-2.5 py-1.5 hover:bg-c-hover">
                Reposition
              </button>
            )}
            <button onClick={() => onChange(null)} className="border-l border-c-hover px-2.5 py-1.5 hover:bg-c-hover">
              Remove
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                onChange({ ...cover, y: Math.round(repositioning) });
                setRepositioning(undefined);
              }}
              className="px-2.5 py-1.5 hover:bg-c-hover"
            >
              Save position
            </button>
            <button onClick={() => setRepositioning(undefined)} className="border-l border-c-hover px-2.5 py-1.5 hover:bg-c-hover">
              Cancel
            </button>
          </>
        )}
      </div>
      {changing && (
        <Popover anchor={changeAnchor} placement="bottom-end" onClose={() => setChanging(false)} className="w-[440px]">
          <CoverPicker
            onPick={(src) => {
              onChange({ src, y: 50 });
              setChanging(false);
            }}
          />
        </Popover>
      )}
    </div>
  );
}

function CoverPicker({ onPick }: { onPick: (src: string) => void }) {
  const mediaClient = useRegistry(MediaClient);
  const workspace = useWorkspaces().current;
  const [tab, setTab] = useState<"gallery" | "upload" | "link">("gallery");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function upload(file: File) {
    try {
      setBusy(true);
      setError(undefined);
      onPick((await mediaClient.upload(workspace!.id, file)).url);
    } catch (e) {
      setError(ProblemDetails.isInstance(e) ? e.problem : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-sm">
      <div className="flex gap-1 border-b border-c-hover px-2 pt-2 pb-1">
        {(["gallery", "upload", "link"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={clsx("rounded px-2 py-1 capitalize hover:bg-c-hover", tab === t && "font-semibold")}>
            {t}
          </button>
        ))}
      </div>
      <div className="p-3">
        {tab === "gallery" && (
          <div className="grid grid-cols-4 gap-2">
            {Object.keys(Cover.PRESETS).map((name) => (
              <button
                key={name}
                aria-label={`cover ${name}`}
                onClick={() => onPick(`preset:${name}`)}
                className="h-14 rounded hover:opacity-80"
                style={Cover.style({ src: `preset:${name}`, y: 50 })}
              />
            ))}
          </div>
        )}
        {tab === "upload" && (
          <label className="block cursor-pointer rounded-md border border-c-hover px-3 py-2 text-center hover:bg-c-hover">
            {busy ? "Uploading…" : "Upload an image"}
            <input type="file" accept="image/*" aria-label="upload cover" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        )}
        {tab === "link" && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (link.trim()) onPick(link.trim());
            }}
          >
            <input
              autoFocus
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Paste an image link…"
              className="flex-1 rounded-md bg-c-hover px-2 py-1.5 outline-none focus:ring-2 focus:ring-c-accent/40"
            />
            <button type="submit" className="rounded-md bg-c-accent px-3 py-1.5 font-medium text-white">
              Submit
            </button>
          </form>
        )}
        {error && <div className="mt-2 text-c-error">{error}</div>}
      </div>
    </div>
  );
}
