Whatever markdown can express, Notas stores as plain markdown. The blocks markdown has no syntax for are stored as **directives**: a name, attributes between braces, and for a block that holds other blocks, a fence of colons around them.

```markdown
::video{src="/media/0199…/clip.mp4"}

:::callout{icon="💡"}
Any **markdown** goes in here.
:::
```

A viewer that doesn't know a directive simply shows it as text, so a page stays readable anywhere.

::toc

## Media

Images use plain markdown, `![alt](src)`. Video, audio, files and embeds are directives, `::video`, `::audio`, `::file` and `::embed`.

## Nesting

::::toggle[A toggle holding a callout]
:::callout{icon="📦"}
A container inside a container: the outer fence is the longer one.
:::
::::
