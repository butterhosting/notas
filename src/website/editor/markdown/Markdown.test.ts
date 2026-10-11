import { RestrictedService } from "@/services/RestrictedService";
import { TestEnvironment } from "@/testing/TestEnvironment.test";
import { getSchema, JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { beforeEach, describe, expect, it } from "bun:test";
import { EditorExtensions } from "../EditorExtensions";

// the stored format: what goes in must come back out
describe("Markdown", () => {
  const manager = new MarkdownManager({ extensions: EditorExtensions.CONTENT });
  const schema = getSchema(EditorExtensions.CONTENT);

  function parse(markdown: string): JSONContent {
    const json = manager.parse(markdown);
    // throws on a schema violation
    schema.nodeFromJSON(json).check();
    return json;
  }

  function roundtrip(markdown: string): string {
    return manager.serialize(parse(markdown));
  }

  beforeEach(async () => {
    await TestEnvironment.initialize();
  });

  it("should round-trip every directive exactly", () => {
    // given
    const cases = [
      '::video{src="/media/0199/clip.mp4"}',
      '::audio{src="/media/0199/memo.m4a"}',
      '::file{src="/media/0199/report.pdf" name="Q3 report.pdf" size="12345"}',
      '::embed{src="https://www.youtube.com/watch?v=dQw4w9WgXcQ"}',
      "::video",
      "::image",
      "::toc",
      '::page{id="0199c3a4-0000-7000-8000-000000000000"}',
      ':::callout{icon="💡"}\nSome **bold** text.\n:::',
      ':::callout{icon="🧪"}\n- a list\n- inside\n\nand a paragraph\n:::',
      ":::toggle[A *summary*]\nHidden.\n:::",
      ':::toggle[Heading toggle]{level="2"}\nHidden.\n:::',
      '::::toggle[Outer]\n:::callout{icon="📦"}\nInner.\n:::\n::::',
      '![a cat](/media/0199/cat.png)',
      "::::columns\n:::column\nLeft\n:::\n:::column\n- a list\n\nand more\n:::\n::::",
      "::::tabs\n:::tab[Overview]\nFirst.\n:::\n:::tab[Arrays \\[\\] \\\\ and *stars*]\nSecond.\n:::\n::::",
      ':::::tabs\n::::tab[Nested]\n:::callout{icon="📦"}\nDeep.\n:::\n::::\n:::::',
    ];

    // then
    for (const markdown of cases) {
      expect(roundtrip(markdown)).toEqual(markdown);
    }
  });

  it("should parse directives into their nodes", () => {
    // when
    const { content } = parse(
      [
        '::video{src="/media/a/clip.mp4"}',
        ':::callout{icon="🔥"}\nHot.\n:::',
        ":::toggle[Open me]{level=\"3\"}\nInside.\n:::",
        "::image",
      ].join("\n\n"),
    );
    // then
    expect(content).toEqual([
      { type: "video", attrs: { src: "/media/a/clip.mp4" } },
      { type: "callout", attrs: { icon: "🔥" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Hot." }] }] },
      {
        type: "details",
        attrs: { level: 3 },
        content: [
          { type: "detailsSummary", content: [{ type: "text", text: "Open me" }] },
          { type: "detailsContent", content: [{ type: "paragraph", content: [{ type: "text", text: "Inside." }] }] },
        ],
      },
      { type: "image", attrs: { src: null } },
    ]);
  });

  it("should open the first tab, keep a tab label as plain text, and put stray blocks in columns", () => {
    // when
    const { content } = parse(["::::tabs", ":::tab[A [b] \\] *c*]", "One.", ":::", ":::tab[Two]", "Two.", ":::", "::::", "", "::::columns", "Loose.", "::::"].join("\n"));
    // then
    const [tabs, columns] = content!;
    expect(tabs!.content!.map(({ attrs }) => attrs)).toEqual([
      { label: "A [b] ] *c*", active: true },
      { label: "Two" },
    ]);
    expect(columns!.content!.map(({ content }) => content?.map(({ type }) => type))).toEqual([["paragraph"], ["paragraph"]]);
    expect(columns!.content![0]!.content![0]!.content).toEqual([{ type: "text", text: "Loose." }]);
  });

  it("should accept nested containers with fences of equal length, and lengthen the outer one", () => {
    // when
    const markdown = roundtrip(":::toggle[Outer]\n:::callout{icon=\"📦\"}\nInner.\n:::\n:::");
    // then
    expect(markdown).toEqual('::::toggle[Outer]\n:::callout{icon="📦"}\nInner.\n:::\n::::');
  });

  it("should keep any character in an attribute", () => {
    // given
    const name = 'He said "hi" & left\nearly.pdf';
    const markdown = manager.serialize({ type: "doc", content: [{ type: "file", attrs: { src: "/media/a/x.pdf", name, size: null } }] });

    // when
    const { content } = parse(markdown);
    // then
    expect(markdown).toEqual('::file{src="/media/a/x.pdf" name="He said &quot;hi&quot; &amp; left&#10;early.pdf"}');
    expect(content?.[0]?.attrs?.name).toEqual(name);
  });

  it("should leave directive syntax inside code alone", () => {
    // given
    const markdown = '```markdown\n:::callout{icon="💡"}\nNot a callout.\n:::\n```';

    // when
    const { content } = parse(markdown);
    // then
    expect(content?.map(({ type }) => type)).toEqual(["codeBlock"]);
    expect(roundtrip(markdown)).toEqual(markdown);
  });

  it("should leave an unknown or malformed directive as text", () => {
    // when
    const { content } = parse("::unknown{a=\"b\"}\n\n::video{src=\"unterminated\n\n:::callout\nnever closed");
    // then
    expect(content?.map(({ type }) => type)).toEqual(["paragraph", "paragraph", "paragraph"]);
  });

  it("should round-trip the seed pages exactly", async () => {
    for (const seed of RestrictedService.SEEDS) {
      // given
      const markdown = (await RestrictedService.seedMarkdown(seed)).trimEnd();
      // then
      expect(roundtrip(markdown)).toEqual(markdown);
    }
  });

  it("should settle standard markdown into one stable form", () => {
    // given
    const markdown = [
      "# Title",
      "Some __bold__, _italic_ and `code`, a [link](https://example.com) and ++underline++.",
      "* a\n* b\n    * nested",
      "1. one\n2. two",
      "- [ ] todo\n- [x] done",
      "> quote",
      "***",
      "```ts\nconst a = 1;\n```",
      "| a | b |\n|---|---|\n| 1 | 2 |",
    ].join("\n\n");

    // when
    const once = roundtrip(markdown);
    // then
    expect(roundtrip(once)).toEqual(once);
  });
});
