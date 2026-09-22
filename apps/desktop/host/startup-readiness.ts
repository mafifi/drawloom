/** Private native-shell handshake; never send this record to telemetry or UI. */
export function startupReadiness(url: string, dataDirectory: string, managed: boolean): string {
  return managed ? JSON.stringify({ url, dataDirectory }) : url;
}
