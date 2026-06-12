/**
 * Pure duration formatter for the turn-timer extension.
 *
 * Renders an elapsed wall-clock span (milliseconds) as a compact, human-readable
 * string. Sub-minute spans get one decimal of seconds ("0.4s", "12.3s"); longer
 * spans switch to whole-second components ("1m 23s", "1h 2m 5s").
 *
 * The seconds/minutes boundary is decided on the *displayed* value (tenths of a
 * second) rather than the raw milliseconds, so a span that rounds up to "60.0s"
 * is rendered as "1m 0s" instead.
 */
export function formatDuration(ms: number): string {
	const safeMs = ms < 0 ? 0 : ms;
	const tenths = Math.round(safeMs / 100);

	// Under 60.0s once rounded to one decimal place.
	if (tenths < 600) {
		return `${(tenths / 10).toFixed(1)}s`;
	}

	const totalSeconds = Math.round(safeMs / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}h ${minutes}m ${seconds}s`;
	}
	return `${minutes}m ${seconds}s`;
}
