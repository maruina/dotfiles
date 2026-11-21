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
import { describe, type NumberedBlock } from "./blocks.ts";

const PREVIEW_LINES = 12;

function printable(data: string): string | undefined {
	const decoded = decodeKittyPrintable(data);
	if (decoded !== undefined) return decoded;
	return [...data].length === 1 && !/[\x00-\x1f\x7f]/.test(data) ? data : undefined;
}
const VISIBLE_ITEMS = 8;

/** Fuzzy-searchable list of every block in the session, newest first, with a preview of the selection. */
export async function pickBlock(ctx: ExtensionContext, blocks: NumberedBlock[], initialQuery = ""): Promise<NumberedBlock | undefined> {
	const byId = new Map(blocks.map((block) => [String(block.id), block]));
	const searchText = (block: NumberedBlock) => `#${block.id} ${block.lang} ${block.text}`;

	return ctx.ui.custom<NumberedBlock | undefined>((tui, theme, _kb, done) => {
		let query = initialQuery;
		let list: SelectList;
		let selected: NumberedBlock | undefined;

		const listTheme = {
			selectedPrefix: (text: string) => theme.fg("accent", text),
			selectedText: (text: string) => theme.fg("accent", text),
			description: (text: string) => theme.fg("muted", text),
			scrollInfo: (text: string) => theme.fg("dim", text),
			noMatch: (text: string) => theme.fg("warning", text),
		};

		const rebuild = () => {
			const matches = query.trim() ? fuzzyFilter(blocks, query, searchText) : blocks;
			const items: SelectItem[] = matches.map((block) => ({
				value: String(block.id),
				label: `#${block.id}`,
				description: describe(block, 60),
			}));
			list = new SelectList(items, Math.min(Math.max(items.length, 1), VISIBLE_ITEMS), listTheme, {
				minPrimaryColumnWidth: 5,
				maxPrimaryColumnWidth: 6,
			});
			list.onSelect = (item) => done(byId.get(item.value));
			list.onCancel = () => done(undefined);
			list.onSelectionChange = (item) => {
				selected = byId.get(item.value);
			};
			selected = matches[0];
		};
		rebuild();

		const component: Component = {
			render(width: number) {
				const rule = theme.fg("accent", "─".repeat(width));
				const header = `${theme.fg("accent", theme.bold("Copy a block"))}  ${theme.fg("dim", "search:")} ${query}${theme.fg("accent", "▏")}`;
				const body = selected ? list.render(width) : [theme.fg("warning", "  No matching blocks")];
				const lines = [rule, truncateToWidth(header, width), ...body];
				if (selected) {
					lines.push(theme.fg("dim", "─".repeat(width)));
					const preview = selected.text.split("\n");
					for (const line of preview.slice(0, PREVIEW_LINES)) {
						lines.push(truncateToWidth(theme.fg("toolOutput", `  ${line.replaceAll("\t", "  ")}`), width));
					}
					if (preview.length > PREVIEW_LINES) lines.push(theme.fg("dim", `  … ${preview.length - PREVIEW_LINES} more lines`));
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
