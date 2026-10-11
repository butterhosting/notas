import { Page } from "@/models/Page";
import { CSSProperties } from "react";

// a url, or `preset:<name>` for one of the gradients below
export namespace Cover {
  export const PRESETS: Record<string, string> = {
    sunset: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
    ocean: "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)",
    lavender: "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)",
    forest: "linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)",
    peach: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
    dusk: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
    sand: "#f0c56a",
    slate: "#cfd8dc",
    rose: "#f4b6c2",
    mint: "#b7e4c7",
  };

  export function style({ src, y }: Page.Cover): CSSProperties {
    const preset = src.startsWith("preset:") ? PRESETS[src.slice("preset:".length)] : undefined;
    return {
      background: preset ?? `url("${src.replaceAll('"', "%22")}") center ${y}% / cover no-repeat`,
    };
  }

  export function random(): Page.Cover {
    const names = Object.keys(PRESETS);
    return { src: `preset:${names[Math.floor(Math.random() * names.length)]}`, y: 50 };
  }
}
