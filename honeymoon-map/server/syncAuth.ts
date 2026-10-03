import { createDecipheriv, createHash, createHmac, pbkdf2, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import manifest from '../src/data/attachments.json' with { type: 'json' }
import { sessionSecret } from './sessionSecret.js'

const COOKIE = 'honeymoon_sync'
const AGE = 60 * 60 * 24 * 180
export function configured() {
  const storage = !!process.env.BLOB_READ_WRITE_TOKEN || (!!process.env.BLOB_STORE_ID && !!process.env.VERCEL_OIDC_TOKEN)
  return storage && (!!process.env.HONEYMOON_SYNC_PASSWORD || !!manifest.check)
}
async function sign(payload: string) {
  const secret = await sessionSecret()
  return createHmac('sha256', secret).update(payload).digest('base64url')
}
export async function authenticated(req: VercelRequest) {
  const cookie = req.cookies?.[COOKIE] ?? req.headers.cookie?.split('; ').find((c) => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1)
  if (!cookie) return false
  const [expiry, signature] = cookie.split('.')
  if (!signature || !/^\d+$/.test(expiry) || Number(expiry) < Date.now()) return false
  const expected = Buffer.from(await sign(expiry))
  const actual = Buffer.from(signature)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
export async function sessionCookie(res: VercelResponse, clear = false) {
  const expiry = String(Date.now() + AGE * 1000)
  res.setHeader('Set-Cookie', `${COOKIE}=${clear ? '' : expiry + '.' + await sign(expiry)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : AGE}`)
}
export async function verifyPassword(password: unknown) {
  if (typeof password !== 'string' || !password || password.length > 256) return false
  if (process.env.HONEYMOON_SYNC_PASSWORD) {
    const hash = (v: string) => createHash('sha256').update(v).digest()
    return timingSafeEqual(hash(password), hash(process.env.HONEYMOON_SYNC_PASSWORD))
  }
  if (!manifest.check) return false
  try {
    const key = await promisify(pbkdf2)(password, Buffer.from(manifest.kdf.salt, 'base64'), manifest.kdf.iterations, 32, 'sha256')
    const cipher = Buffer.from(manifest.check.data, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(manifest.check.iv, 'base64'))
    decipher.setAuthTag(cipher.subarray(-16))
    return Buffer.concat([decipher.update(cipher.subarray(0, -16)), decipher.final()]).toString() === 'honeymoon-attachments-ok'
  } catch { return false }
}
export function sameOrigin(req: VercelRequest) {
  if (!req.headers.origin) return false
  try { return new URL(req.headers.origin).host === req.headers.host } catch { return false }
}
