import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/**
 * Opens the picker. Not a plain `alt+<letter>`: some setups, such as tmux, deliver Cmd+<letter>
 * as Alt+<letter>, so Cmd+C after selecting text would open the picker.
 */
export const DEFAULT_SHORTCUT = "ctrl+alt+b";

export const CONFIG_PATH = join(getAgentDir(), "copycat.json");

export interface CopycatConfig {
	/** Picker shortcut, or undefined for none. */
	shortcut?: string;
	/** Whether to add the "put pasteable text in one fenced block" rule to the system prompt. */
	promptRule: boolean;
	/** Problems with the config file, if any. Affected settings fall back to defaults. */
	warnings: string[];
}

const DEFAULTS: CopycatConfig = { shortcut: DEFAULT_SHORTCUT, promptRule: true, warnings: [] };

const MODIFIERS = new Set(["ctrl", "alt", "shift", "super"]);

/** Loose check for pi key ids such as `ctrl+alt+b`, `ctrl+shift+f5` or `alt+enter`. */
export function isKeyId(value: string): boolean {
	const parts = value.toLowerCase().split("+");
	const base = parts.pop() ?? "";
	if (!/^([a-z0-9]|[a-z][a-z0-9]+|[`\-=[\]\\;',./])$/.test(base)) return false;
	return new Set(parts).size === parts.length && parts.every((part) => MODIFIERS.has(part));
}

/**
 * Reads `~/.pi/agent/copycat.json`. A missing file or missing key means the default.
 * `"shortcut": ""` or `false` turns the shortcut off. `"promptRule": false` leaves the system prompt alone.
 */
export function readConfig(path: string = CONFIG_PATH): CopycatConfig {
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch {
		return { ...DEFAULTS, warnings: [] };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { ...DEFAULTS, warnings: [`${path} is not valid JSON, using defaults`] };
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		return { ...DEFAULTS, warnings: [`${path} should be a JSON object, using defaults`] };
	}
	const { shortcut, promptRule } = parsed as { shortcut?: unknown; promptRule?: unknown };
	const config: CopycatConfig = { ...DEFAULTS, warnings: [] };

	if (shortcut === false || shortcut === "") config.shortcut = undefined;
	else if (typeof shortcut === "string" && isKeyId(shortcut.trim())) config.shortcut = shortcut.trim().toLowerCase();
	else if (shortcut !== undefined) {
		config.warnings.push(`${path}: "shortcut" should be a key like "ctrl+alt+b", or "" to turn it off. Using ${DEFAULT_SHORTCUT}`);
	}

	if (typeof promptRule === "boolean") config.promptRule = promptRule;
	else if (promptRule !== undefined) config.warnings.push(`${path}: "promptRule" should be true or false. Using true`);

	return config;
}
