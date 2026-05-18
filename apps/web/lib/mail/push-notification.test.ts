import { describe, expect, it } from 'vitest'
import { decodeGoogleMailboxNotification } from './push-notification'

describe('decodeGoogleMailboxNotification', () => {
  it('decodes Gmail Pub/Sub mailbox notifications', () => {
    const data = Buffer.from(JSON.stringify({
      emailAddress: 'estimator@example.com',
      historyId: '12345',
    })).toString('base64url')

    expect(decodeGoogleMailboxNotification(data)).toEqual({
      emailAddress: 'estimator@example.com',
      historyId: '12345',
    })
  })

  it('ignores malformed notification fields', () => {
    const data = Buffer.from(JSON.stringify({
      emailAddress: 42,
      historyId: null,
    })).toString('base64url')

    expect(decodeGoogleMailboxNotification(data)).toEqual({
      emailAddress: undefined,
      historyId: undefined,
    })
  })
})
