import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Component, type TuiMouseEvent, type TuiMouseEventResult, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { type CodeBlock, describe } from "./blocks.ts";

export interface BarChip {
	/** Session-wide block number, or undefined for the "whole response" chip. */
	id?: number;
	label: string;
	text: string;
}

interface Hit {
	row: number;
	start: number;
	end: number;
	chip: BarChip;
}

const FLASH_MS = 1500;
const PAD = 1;

/** One row (or more, when wrapped) of clickable copy chips under a response. */
export class CopyBar implements Component {
	private hits: Hit[] = [];
	private flashed?: { chip: BarChip; until: number };
	private readonly chips: BarChip[];
	private readonly theme: Theme;
	private readonly onCopy: (chip: BarChip) => Promise<boolean>;

	constructor(
		chips: BarChip[],
		theme: Theme,
		onCopy: (chip: BarChip) => Promise<boolean>,
	) {
		this.chips = chips;
		this.theme = theme;
		this.onCopy = onCopy;
	}

	static chipsFor(blocks: (CodeBlock & { id: number })[], fullText: string | undefined): BarChip[] {
		const chips: BarChip[] = blocks.map((block) => ({ id: block.id, label: `#${block.id} ${describe(block, 24)}`, text: block.text }));
		if (fullText && chips.length > 0) chips.push({ label: "whole response", text: fullText });
		return chips;
	}

	render(width: number): string[] {
		const t = this.theme;
		const inner = Math.max(10, width - PAD * 2);
		const prefix = `${t.fg("dim", "⧉ copy")} `;
		const prefixWidth = visibleWidth(prefix);
		const rows: string[] = [];
		this.hits = [];
		let row = prefix;
		let col = prefixWidth;
		const now = Date.now();
		for (const chip of this.chips) {
			const flashing = this.flashed?.chip === chip && this.flashed.until > now;
			// The flash keeps the chip's width so nothing shifts under the cursor.
			const raw = truncateToWidth(chip.label, inner - prefixWidth - 2);
			const chipWidth = visibleWidth(raw) + 2;
			if (col + chipWidth > inner && col > prefixWidth) {
				rows.push(row);
				row = " ".repeat(prefixWidth);
				col = prefixWidth;
			}
			const styled = flashing
				? t.fg("success", t.bold(`✓${raw}]`))
				: `${t.fg("dim", "[")}${t.fg(chip.id === undefined ? "muted" : "accent", raw)}${t.fg("dim", "]")}`;
			this.hits.push({ row: rows.length, start: PAD + col, end: PAD + col + chipWidth, chip });
			row += styled;
			col += chipWidth;
			if (col + 1 <= inner) {
				row += " ";
				col += 1;
			}
		}
		rows.push(row);
		return rows.map((line) => " ".repeat(PAD) + line);
	}

	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		const hit = this.hits.find((h) => h.row === event.y && event.x >= h.start && event.x < h.end);
		if (!hit) return undefined;
		// Swallow the press so the transcript does not start a text selection on the chip.
		if (event.type !== "click") return event.type === "press" ? { handled: true } : undefined;
		if (event.button !== "left") return undefined;
		const flash = { chip: hit.chip, until: Date.now() + FLASH_MS };
		this.flashed = flash;
		void this.onCopy(hit.chip).then((ok) => {
			if (!ok && this.flashed === flash) this.flashed = undefined;
		});
		return { handled: true, render: true };
	}

	invalidate(): void {}
}
