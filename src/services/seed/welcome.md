Notas is a small, self-hosted Notion. Every page is **markdown** underneath, so nothing you write here is locked in.

:::callout{icon="💡"}
Type `/` anywhere to insert a block, or drag the `⋮⋮` handle next to a block to move it around.
:::

## The basics

- Bulleted lists, with **bold**, *italic*, ~~strike~~ and `code`
- [Links](https://github.com) too

1. Numbered lists
2. That count by themselves

- [x] To-do lists
- [ ] That you can tick off

> Quotes, for the words of others.

---

## Toggles

:::toggle[Click the arrow to open this toggle]
Toggles hide whatever you put inside them, until you open them.
:::

:::toggle[Toggles can be headings too]{level="3"}
Handy for long pages.
:::

## Code

```ts
const workspaces = await fetch("/api/workspaces").then((r) => r.json());
```

## Tables

| Block   | Markdown     |
| ------- | ------------ |
| Callout | `:::callout` |
| Video   | `::video`    |
