import type { JSONContent, MarkdownRendererHelpers, MarkdownToken } from "@tiptap/core";

// Fixes to how TipTap writes markdown, where what it writes reads back as something else
export namespace Markdown {
  // what a line can start with to begin another block; TipTap already escapes the inline syntax (`*`, `_`, `` ` ``, `~`)
  const BLOCK_STARTS: [RegExp, string][] = [
    [/^( {0,3})([-+])(?=[ \t]|$)/gm, "$1\\$2"],
    [/^( {0,3}\d{1,9})([.)])(?=[ \t]|$)/gm, "$1\\$2"],
    [/^( {0,3})(#)(?=#{0,5}(?:[ \t]|$))/gm, "$1\\$2"],
    [/^( {0,3})(>)/gm, "$1\\$2"],
    // a setext underline or a thematic break
    [/^( {0,3})([-=])(?=\2*[ \t]*$)/gm, "$1\\$2"],
    // a directive; its tokenizers still match after a backslash, not after an entity
    [/^( {0,3}):(?=:)/gm, "$1&#58;"],
  ];

  const LISTS = new Set(["bulletList", "orderedList", "taskList"]);

  /** A paragraph's text that starts like another block, on any of its lines, keeps reading as text. */
  export function escapeBlockStarts(markdown: string): string {
    return BLOCK_STARTS.reduce((escaped, [pattern, replacement]) => escaped.replace(pattern, replacement), markdown);
  }

  /**
   * A paragraph's leading whitespace means nothing, but TipTap's ordered list leaves a space in front of every block
   * after an item's first (it dedents `1. ` by two), which would keep a lone image from being read as an image block.
   */
  export function withoutLeadingSpace(token: MarkdownToken): MarkdownToken {
    const [first, ...rest] = token.tokens ?? [];
    if (first?.type !== "text" || !/^\s/.test(first.text ?? "")) {
      return token;
    }
    const text = first.text!.trimStart();
    return { ...token, tokens: text ? [{ ...first, text, raw: first.raw?.trimStart() }, ...rest] : rest };
  }

  /**
   * TipTap writes a list item's later blocks on the very next line, where its list parsers take any block they don't
   * know (a directive, an image) for more of the paragraph. An empty line before such a block ends the paragraph first.
   */
  export function separatingItemBlocks(h: MarkdownRendererHelpers): MarkdownRendererHelpers {
    return {
      ...h,
      renderChild: (child: JSONContent, index: number) => {
        const markdown = h.renderChild ? h.renderChild(child, index) : h.renderChildren([child]);
        return child.type === "paragraph" || LISTS.has(child.type ?? "") ? markdown : `\n${markdown}`;
      },
    };
  }
}
