export function decodeGoogleMailboxNotification(data: string) {
  if (!data) return {}
  const json = Buffer.from(data.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8')
  const parsed = JSON.parse(json) as { emailAddress?: unknown; historyId?: unknown }
  return {
    emailAddress: typeof parsed.emailAddress === 'string' ? parsed.emailAddress : undefined,
    historyId: typeof parsed.historyId === 'string' ? parsed.historyId : undefined,
  }
}
