/* Copyright Advanced Software and AI Solutions LLC */
/** Logs are always plain text. Never pass this to dangerouslySetInnerHTML. */
export function renderLogAsText(log: string): string {
  return log;
}
