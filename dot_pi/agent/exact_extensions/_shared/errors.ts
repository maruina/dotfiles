/**
 * Returns the message string from an unknown thrown value.
 * Extracts `Error.message` when the value is an Error instance; otherwise
 * coerces to string.
 */
export function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
