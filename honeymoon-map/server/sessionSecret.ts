import { randomBytes } from 'node:crypto'
import { get, put } from '@vercel/blob'

const PATH = 'honeymoon/session-secret-v1.txt'
let loading: Promise<string> | null = null
async function readSecret() {
  const result = await get(PATH, { access: 'private', useCache: false })
  if (!result || result.statusCode !== 200) return null
  const secret = await new Response(result.stream).text()
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('Invalid session secret')
  return secret
}

// OIDC-only stores need a stable private signing key across independent server instances.
export async function sessionSecret(): Promise<string> {
  const configured = process.env.HONEYMOON_SYNC_SECRET || process.env.BLOB_READ_WRITE_TOKEN
  if (configured) return configured
  if (loading) return loading
  loading = Promise.resolve().then(async () => {
    const existing = await readSecret()
    if (existing) return existing
    const secret = randomBytes(32).toString('hex')
    try {
      await put(PATH, secret, { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'text/plain' })
      return secret
    } catch (error) {
      // Concurrent initialization must use the key that actually won the conditional creation.
      const winner = await readSecret()
      if (winner) return winner
      throw error
    }
  }).catch((error) => { loading = null; throw error })
  return loading
}
