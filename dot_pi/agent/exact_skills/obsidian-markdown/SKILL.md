---
name: obsidian-markdown
description: Create and edit Obsidian Flavored Markdown with wikilinks, embeds, callouts, properties, and other Obsidian-specific syntax. Use when working with .md files in Obsidian, or when the user mentions wikilinks, callouts, frontmatter, tags, embeds, or Obsidian notes.
---
# Obsidian Markdown
Use for Obsidian Flavored Markdown. Standard Markdown is assumed; this skill covers Obsidian-specific syntax.

## Workflow
1. Preserve existing wikilinks, embeds, Excalidraw links, `.canvas`, `.base`, and frontmatter unless asked to change them.
2. Use wikilinks for notes inside the vault and Markdown links for external URLs.
3. Add properties in YAML frontmatter only when useful; keep property names stable.
4. Verify syntax that Obsidian parses specially: callouts, embeds, block IDs, comments, and tags.

## Wikilinks
```markdown
[[Note Name]]
[[Note Name|Display Text]]
[[Note Name#Heading]]
[[Note Name#^block-id]]
[[#Heading in same note]]
```

Define block IDs at the end of a paragraph, or on a separate line after a list or quote:

```markdown
This paragraph can be linked to. ^my-block-id
```

## Embeds
```markdown
![[Note Name]]
![[Note Name#Heading]]
![[image.png]]
![[image.png|300]]
![[document.pdf#page=3]]
```

## Callouts
```markdown
> [!note]
> Basic callout.

> [!warning] Custom title
> Callout with a custom title.

> [!faq]- Collapsed by default
> Foldable callout.
```

Common types: `note`, `tip`, `warning`, `info`, `example`, `quote`, `bug`, `danger`, `success`, `failure`, `question`, `abstract`, `todo`.

## Properties
```yaml
---
title: My Note
date: 2026-07-09
tags:
  - project
aliases:
  - Alternative Name
cssclasses:
  - custom-class
---
```

Use `tags`, `aliases`, and `cssclasses` for Obsidian-native behavior. Tags can also appear inline: `#tag` or `#nested/tag`.

## Other Obsidian syntax
```markdown
%% hidden comment %%

==Highlighted text==

Inline footnote.^[This is inline.]

Text with a footnote[^1].
[^1]: Footnote content.
```

For Mermaid nodes that should link to notes, add `class NodeName internal-link;`.

## References
- [Obsidian Flavored Markdown](https://help.obsidian.md/obsidian-flavored-markdown)
- [Internal links](https://help.obsidian.md/links)
- [Embeds](https://help.obsidian.md/embeds)
- [Callouts](https://help.obsidian.md/callouts)
- [Properties](https://help.obsidian.md/properties)
