/* Copyright Advanced Software and AI Solutions LLC */
/** Strip ANSI escape sequences so logs can be shown as plain text only. */
export function stripAnsi(text: string): string {
  return text
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b[@-Z\\-_]/g, '');
}
