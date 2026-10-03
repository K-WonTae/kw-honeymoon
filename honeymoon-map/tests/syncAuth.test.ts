import test from 'node:test'
import assert from 'node:assert/strict'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticated, configured, sameOrigin, sessionCookie, verifyPassword } from '../server/syncAuth'

test('password verification and signed session reject tampering and expiry', async () => {
  process.env.HONEYMOON_SYNC_PASSWORD = 'test-only-password'
  process.env.HONEYMOON_SYNC_SECRET = 'test-only-signing-secret'
  assert.equal(await verifyPassword('wrong'), false)
  assert.equal(await verifyPassword('test-only-password'), true)
  let cookie = ''
  await sessionCookie({ setHeader: (_: string, value: string) => { cookie = value } } as unknown as VercelResponse)
  const value = cookie.split(';')[0].split('=')[1]
  const request = (v: string) => ({ cookies: { honeymoon_sync: v }, headers: {} } as unknown as VercelRequest)
  assert.equal(await authenticated(request(value)), true)
  assert.equal(await authenticated(request(value + 'x')), false)
  assert.equal(await authenticated(request('1.' + value.split('.')[1])), false)
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/)
  delete process.env.HONEYMOON_SYNC_PASSWORD
  delete process.env.HONEYMOON_SYNC_SECRET
})
test('detect both token-based and OIDC-only Blob connections', () => {
  const keys = ['BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID', 'VERCEL_OIDC_TOKEN'] as const
  const saved = keys.map((key) => process.env[key])
  try {
    keys.forEach((key) => { delete process.env[key] })
    assert.equal(configured(), false)
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token'
    assert.equal(configured(), true)
    delete process.env.BLOB_READ_WRITE_TOKEN
    process.env.BLOB_STORE_ID = 'test-store'
    assert.equal(configured(), false)
    process.env.VERCEL_OIDC_TOKEN = 'test-oidc-token'
    assert.equal(configured(), true)
  } finally {
    keys.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index] })
  }
})
test('mutations require the site origin', () => {
  const request = (origin?: string) => ({ headers: { host: 'kw-honeymoon.vercel.app', origin } } as VercelRequest)
  assert.equal(sameOrigin(request('https://kw-honeymoon.vercel.app')), true)
  assert.equal(sameOrigin(request('https://other.example')), false)
  assert.equal(sameOrigin(request()), false)
})
