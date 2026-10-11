import type { JSONContent, MarkdownLexerConfiguration, MarkdownToken, MarkdownTokenizer } from "@tiptap/core";

// Generic directives, as remark-directive writes them (`::leaf{…}`, `:::container[label]{…} … :::`). Nested
// containers are written with a longer outer fence, the form every implementation agrees on; equal fences still parse.
export namespace Directive {
  export type Attributes = Record<string, string>;

  export type Token = MarkdownToken & {
    attributes: Attributes;
    label?: MarkdownToken[];
    labelText?: string;
  };

  const containers = new Set<string>();

  export function leaf(name: string): MarkdownTokenizer {
    return {
      name,
      level: "block",
      start: (src) => src.search(new RegExp(`^::${name}(?![\\w-])`, "m")),
      tokenize(src): Token | undefined {
        const line = parseLine(src, 2, name);
        if (!line || line.label !== undefined) {
          return;
        }
        return { type: name, raw: src.slice(0, line.end), attributes: line.attributes };
      },
    };
  }

  export function container(name: string, nodeType: string = name): MarkdownTokenizer {
    containers.add(nodeType);
    return {
      name,
      level: "block",
      start: (src) => src.search(new RegExp(`^:{3,}${name}(?![\\w-])`, "m")),
      tokenize(src, _tokens, lexer): Token | undefined {
        const line = parseLine(src, 3, name);
        if (!line || src[line.end - 1] !== "\n") {
          return;
        }
        const close = findClosingFence(src, line.end, line.colons);
        if (!close) {
          return;
        }
        return {
          type: name,
          raw: src.slice(0, close.end),
          attributes: line.attributes,
          label: line.label === undefined ? undefined : lexer.inlineTokens(line.label),
          labelText: line.label === undefined ? undefined : unescapeLabel(line.label),
          tokens: blockTokens(src.slice(line.end, close.start), lexer),
        };
      },
    };
  }

  export function renderLeaf(name: string, attributes: Record<string, unknown>): string {
    return `::${name}${serializeAttributes(attributes)}`;
  }

  export function renderContainer(name: string, node: JSONContent, inner: string, options: { label?: string; attributes?: Record<string, unknown> } = {}) {
    const fence = ":".repeat(3 + nestedContainerDepth(node));
    const label = options.label === undefined ? "" : `[${options.label}]`;
    return `${fence}${name}${label}${serializeAttributes(options.attributes ?? {})}\n${inner}\n${fence}`;
  }

  // plain text, not inline markdown
  export function escapeLabel(text: string): string {
    return text.replace(/[\\[\]]/g, "\\$&");
  }

  function unescapeLabel(label: string): string {
    return label.replace(/\\([\\[\]])/g, "$1");
  }

  export function serializeAttributes(attributes: Record<string, unknown>): string {
    const entries = Object.entries(attributes).filter(([, value]) => value !== undefined && value !== null && value !== "");
    if (entries.length === 0) {
      return "";
    }
    return `{${entries.map(([key, value]) => `${key}="${encode(String(value))}"`).join(" ")}}`;
  }

  export function parseAttributes(src: string): Attributes {
    const attributes: Attributes = {};
    for (const match of src.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'}]+))/g)) {
      attributes[match[1]!] = decode(match[2] ?? match[3] ?? match[4] ?? "");
    }
    return attributes;
  }

  type Line = {
    colons: number;
    label?: string;
    attributes: Attributes;
    end: number;
  };

  // not a regex: it has to track nested brackets in the label and quotes in the attributes
  function parseLine(src: string, minColons: number, name: string): Line | undefined {
    let i = 0;
    while (src[i] === ":") i++;
    const colons = i;
    if (colons < minColons || (minColons === 2 && colons !== 2) || !src.startsWith(name, i)) {
      return;
    }
    i += name.length;
    let label: string | undefined;
    if (src[i] === "[") {
      const end = scanBalanced(src, i, "[", "]");
      if (end === undefined) return;
      label = src.slice(i + 1, end);
      i = end + 1;
    }
    let attributes: Attributes = {};
    if (src[i] === "{") {
      const end = scanBalanced(src, i, "{", "}");
      if (end === undefined) return;
      attributes = parseAttributes(src.slice(i + 1, end));
      i = end + 1;
    }
    while (src[i] === " " || src[i] === "\t") i++;
    if (i < src.length && src[i] !== "\n") {
      return;
    }
    return { colons, label, attributes, end: Math.min(i + 1, src.length) };
  }

  function scanBalanced(src: string, from: number, open: string, close: string): number | undefined {
    let depth = 0;
    let quote: string | undefined;
    for (let i = from; i < src.length && src[i] !== "\n"; i++) {
      const char = src[i];
      if (char === "\\") {
        i++;
      } else if (quote) {
        if (char === quote) quote = undefined;
      } else if (open === "{" && (char === '"' || char === "'")) {
        quote = char;
      } else if (char === open) {
        depth++;
      } else if (char === close && --depth === 0) {
        return i;
      }
    }
  }

  // skips fences closing a nested opener of the same length, and anything in fenced code
  function findClosingFence(src: string, from: number, colons: number): { start: number; end: number } | undefined {
    const fence = ":".repeat(colons);
    let depth = 0;
    let code: string | undefined;
    let start = from;
    while (start < src.length) {
      const newline = src.indexOf("\n", start);
      const end = newline === -1 ? src.length : newline + 1;
      const line = src.slice(start, newline === -1 ? src.length : newline);
      const codeFence = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
      if (code) {
        if (codeFence && codeFence[0] === code[0] && codeFence.length >= code.length && line.trim() === codeFence) code = undefined;
      } else if (codeFence) {
        code = codeFence;
      } else if (line.trimEnd() === fence) {
        if (depth === 0) return { start, end };
        depth--;
      } else if (new RegExp(`^${fence}[\\w-]`).test(line)) {
        depth++;
      }
      start = end;
    }
  }

  // marked fills in nested blocks' inline tokens lazily; reading them before it has finds none
  function blockTokens(src: string, lexer: MarkdownLexerConfiguration): MarkdownToken[] {
    const tokens = lexer.blockTokens(src);
    for (const token of tokens) {
      if (token.text && (!token.tokens || token.tokens.length === 0) && token.type !== "code") {
        token.tokens = lexer.inlineTokens(token.text);
      }
    }
    return tokens;
  }

  function nestedContainerDepth(node: JSONContent): number {
    return Math.max(0, ...(node.content ?? []).map((child) => (containers.has(child.type ?? "") ? 1 : 0) + nestedContainerDepth(child)));
  }

  function encode(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("\n", "&#10;");
  }

  function decode(value: string): string {
    return value.replaceAll("&#10;", "\n").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
  }
}
