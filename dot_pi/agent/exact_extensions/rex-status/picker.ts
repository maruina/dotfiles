import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  decodeKittyPrintable,
  fuzzyFilter,
  Key,
  matchesKey,
  type SelectItem,
  SelectList,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { formatRexPaneReference, type RexPane } from "./panes.ts";

const VISIBLE_ITEMS = 10;

function printable(data: string): string | undefined {
  const decoded = decodeKittyPrintable(data);
  if (decoded !== undefined) return decoded;
  return [...data].length === 1 && !/[\x00-\x1f\x7f]/.test(data) ? data : undefined;
}

function paneBadges(pane: RexPane): string {
  const tags: string[] = [];
  if (pane.isCurrentPane) tags.push("here");
  else if (pane.isActiveTab && pane.isFocusedPane) tags.push("focused");
  return tags.length > 0 ? ` [${tags.join(", ")}]` : "";
}

function paneDescription(pane: RexPane): string {
  const pos = pane.position ? ` (${pane.position})` : "";
  return `${pane.windowLabel} / ${pane.blockLabel}${pos}${paneBadges(pane)}`;
}

function paneSearchText(pane: RexPane): string {
  return [
    pane.sessionLabel,
    `tab ${pane.tabIndex}`,
    pane.windowLabel,
    pane.blockLabel,
    pane.position,
    pane.isCurrentSession ? "current" : "",
    pane.isCurrentPane ? "here" : "",
    pane.sessionId,
    pane.blockId,
  ].join(" ");
}

/** Fuzzy-searchable picker of Rex terminal panes with a live preview of the copied reference. */
export async function pickRexPane(
  ctx: ExtensionContext,
  panes: RexPane[],
  initialQuery = "",
): Promise<RexPane | undefined> {
  const byKey = new Map(panes.map((pane) => [`${pane.sessionId}:${pane.blockId}`, pane]));

  return ctx.ui.custom<RexPane | undefined>((tui, theme, _kb, done) => {
    let query = initialQuery;
    let list: SelectList;
    let selected: RexPane | undefined;

    const listTheme = {
      selectedPrefix: (text: string) => theme.fg("accent", text),
      selectedText: (text: string) => theme.fg("accent", text),
      description: (text: string) => theme.fg("muted", text),
      scrollInfo: (text: string) => theme.fg("dim", text),
      noMatch: (text: string) => theme.fg("warning", text),
    };

    const rebuild = () => {
      const matches = query.trim() ? fuzzyFilter(panes, query, paneSearchText) : panes;
      const items: SelectItem[] = matches.map((pane) => ({
        value: `${pane.sessionId}:${pane.blockId}`,
        label: `${pane.isCurrentSession ? "* " : ""}${pane.sessionLabel} · tab ${pane.tabIndex}`,
        description: paneDescription(pane),
      }));
      list = new SelectList(items, Math.min(Math.max(items.length, 1), VISIBLE_ITEMS), listTheme, {
        minPrimaryColumnWidth: 16,
        maxPrimaryColumnWidth: 34,
      });
      list.onSelect = (item) => done(byKey.get(item.value));
      list.onCancel = () => done(undefined);
      list.onSelectionChange = (item) => {
        selected = byKey.get(item.value);
      };
      selected = matches[0];
    };
    rebuild();

    const component: Component = {
      render(width: number) {
        const rule = theme.fg("accent", "─".repeat(width));
        const header = `${theme.fg("accent", theme.bold("Copy Rex pane reference"))}  ${theme.fg("dim", "search:")} ${query}${theme.fg("accent", "▏")}`;
        const body = selected ? list.render(width) : [theme.fg("warning", "  No matching Rex panes")];
        const lines = [rule, truncateToWidth(header, width), ...body];
        if (selected) {
          lines.push(theme.fg("dim", "─".repeat(width)));
          for (const line of formatRexPaneReference(selected).split("\n")) {
            lines.push(truncateToWidth(theme.fg("toolOutput", `  ${line}`), width));
          }
        }
        lines.push(truncateToWidth(theme.fg("dim", "type to search • ↑↓ move • enter copy • esc cancel"), width), rule);
        return lines;
      },
      invalidate() {
        list.invalidate();
      },
      handleInput(data: string) {
        if (matchesKey(data, Key.backspace)) {
          if (query) {
            query = query.slice(0, -1);
            rebuild();
          }
        } else {
          const ch = printable(data);
          if (ch !== undefined) {
            query += ch;
            rebuild();
          } else {
            list.handleInput(data);
          }
        }
        tui.requestRender();
      },
    };
    return component;
  });
}
