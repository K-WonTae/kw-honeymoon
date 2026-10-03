import test from 'node:test'
import assert from 'node:assert/strict'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticated, sameOrigin, sessionCookie, verifyPassword } from '../server/syncAuth'

test('password verification and signed session reject tampering and expiry', async () => {
  process.env.HONEYMOON_SYNC_PASSWORD = 'test-only-password'
  process.env.HONEYMOON_SYNC_SECRET = 'test-only-signing-secret'
  assert.equal(await verifyPassword('wrong'), false)
  assert.equal(await verifyPassword('test-only-password'), true)
  let cookie = ''
  sessionCookie({ setHeader: (_: string, value: string) => { cookie = value } } as unknown as VercelResponse)
  const value = cookie.split(';')[0].split('=')[1]
  const request = (v: string) => ({ cookies: { honeymoon_sync: v }, headers: {} } as unknown as VercelRequest)
  assert.equal(authenticated(request(value)), true)
  assert.equal(authenticated(request(value + 'x')), false)
  assert.equal(authenticated(request('1.' + value.split('.')[1])), false)
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/)
  delete process.env.HONEYMOON_SYNC_PASSWORD
  delete process.env.HONEYMOON_SYNC_SECRET
})
test('mutations require the site origin', () => {
  const request = (origin?: string) => ({ headers: { host: 'kw-honeymoon.vercel.app', origin } } as VercelRequest)
  assert.equal(sameOrigin(request('https://kw-honeymoon.vercel.app')), true)
  assert.equal(sameOrigin(request('https://other.example')), false)
  assert.equal(sameOrigin(request()), false)
})
