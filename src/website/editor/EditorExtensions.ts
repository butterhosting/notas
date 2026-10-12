import { Node } from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "./markdown/Markdown";
import { Callout } from "./nodes/Callout";
import { ColumnsKit } from "./nodes/Columns";
import { Media } from "./nodes/Media";
import { PageLink } from "./nodes/PageLink";
import { TableOfContents } from "./nodes/TableOfContents";
import { TabsKit } from "./nodes/Tabs";
import { ToggleKit } from "./nodes/Toggle";

// StarterKit doesn't export its paragraph and list item, so they are fixed where it creates them
const FixedStarterKit = StarterKit.extend({
  addExtensions() {
    return this.parent!().map((extension) => {
      switch (extension.name) {
        case "paragraph":
          return (extension as Node).extend({
            renderMarkdown(node, h, ctx) {
              return Markdown.escapeBlockStarts(this.parent!(node, h, ctx));
            },
          });
        case "listItem":
          return (extension as Node).extend({
            renderMarkdown(node, h, ctx) {
              return this.parent!(node, Markdown.separatingItemBlocks(h), ctx);
            },
          });
        default:
          return extension;
      }
    });
  },
});

export namespace EditorExtensions {
  // everything the stored format depends on, and none of the editing ui
  export const CONTENT = [
    FixedStarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      dropcursor: { color: "#2383e2", width: 3 },
    }),
    TaskList,
    TaskItem.extend({
      renderMarkdown(node, h, ctx) {
        return this.parent!(node, Markdown.separatingItemBlocks(h), ctx);
      },
    }).configure({ nested: true }),
    Table.extend({
      // the stock renderer adds blank lines around a table, which pile up on every save
      renderMarkdown(node, h, ctx) {
        return this.parent!(node, h, ctx).replace(/^\n+|\n+$/g, "");
      },
    }).configure({ resizable: false, renderWrapper: true }),
    TableRow,
    TableHeader,
    TableCell,
    ...ToggleKit,
    Callout,
    ...Media.ALL,
    TableOfContents,
    PageLink,
    ...ColumnsKit,
    ...TabsKit,
  ];
}
