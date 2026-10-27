/**
 * Logs a server error without the data it was handling. Database errors
 * include the query's parameters in their message ("params: ..."), which can
 * be a customer's phone number or an email address; those are cut off, so
 * hosting logs never collect personal data.
 */
export function logError(label: string, error: unknown): void {
  console.error(label, describeError(error));
}

function clean(message: string): string {
  return message.split(/\n?params:/)[0].slice(0, 500);
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown error";
  const cause = (error as { cause?: unknown }).cause;
  const causeText = cause instanceof Error ? ` (cause: ${cause.name}: ${clean(cause.message)})` : "";
  return `${error.name}: ${clean(error.message)}${causeText}`;
}
