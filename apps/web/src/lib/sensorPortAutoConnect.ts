/** Port to pass to `sensor.connection.connect` for a one-shot auto-connect attempt. */
export function resolveSensorPortForAutoConnect(
  ports: { path: string }[],
  savedPort: string,
): string | undefined {
  if (ports.length === 1) return ports[0].path;
  const saved = savedPort.trim();
  if (saved) return saved;
  return undefined;
}
