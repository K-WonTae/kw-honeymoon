#!/usr/bin/env node
// 백업 JSON 의 첨부파일을 암호화해 배포에 내장한다.
//
//   node scripts/pack-attachments.mjs --backup "C:/.../honeymoon-backup-20260920.json" --password "암호"
//
// 결과:
//   public/att/b-NN.bin      AES-256-GCM 암호문 (암호 없이는 못 연다)
//   src/data/attachments.json  salt·IV·암호화된 목록 (파일명도 암호문 안에 있다)
//
// 이렇게 하면 기기·브라우저를 바꿔도 사이트만 열면 첨부가 그대로 보인다.
// 브라우저 저장소(IndexedDB)로 옮기는 과정이 아예 필요 없어진다.
//
// 내용이 똑같은 파일(예: 왕복 e-티켓을 출국·귀국 카드 양쪽에)은 한 번만 암호화해 싣고,
// 목록에서 두 카드가 같은 bin 을 가리킨다. 📎 첨부 탭은 그 파일을 한 줄로 보여준다.

import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'att')
const MANIFEST = join(ROOT, 'src', 'data', 'attachments.json')
const ITERATIONS = 250_000
const CHECK_PLAINTEXT = 'honeymoon-attachments-ok'

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const backupPath = arg('backup')
const passwordFile = arg('password-file')
const password = passwordFile ? readFileSync(passwordFile, 'utf8').trim() : arg('password')

if (!backupPath || !password) {
  console.error('사용법: node scripts/pack-attachments.mjs --backup <백업.json> --password-file <로컬 암호 파일> (또는 --password <암호>)')
  process.exit(1)
}
if (!existsSync(backupPath)) {
  console.error(`백업 파일을 찾을 수 없습니다: ${backupPath}`)
  process.exit(1)
}

const backup = JSON.parse(readFileSync(backupPath, 'utf8'))
if (backup?.schema !== 'honeymoon-backup') {
  console.error('honeymoon-backup 형식이 아닙니다.')
  process.exit(1)
}

const salt = randomBytes(16)
const key = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256')

/** AES-256-GCM 으로 암호화하고 인증태그를 뒤에 붙인다 (WebCrypto 가 기대하는 배치) */
function encrypt(buf) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(buf), cipher.final()])
  return { iv: iv.toString('base64'), data: Buffer.concat([body, cipher.getAuthTag()]) }
}

// 이전 결과물 정리 (지금 백업에 없는 파일이 남지 않도록)
if (existsSync(OUT_DIR)) {
  for (const f of readdirSync(OUT_DIR)) {
    if (f.endsWith('.bin')) rmSync(join(OUT_DIR, f))
  }
} else {
  mkdirSync(OUT_DIR, { recursive: true })
}

const index = {}
/** sha256(원본) → 이미 실은 파일 {id, file, iv}. 같은 내용은 한 번만 싣는다. */
const byHash = new Map()
let packed = 0
let shared = 0
let bytes = 0

for (const att of backup.attachments) {
  const plain = Buffer.from(att.dataBase64, 'base64')
  const hash = createHash('sha256').update(plain).digest('hex')
  let stored = byHash.get(hash)

  if (!stored) {
    const n = String(byHash.size + 1).padStart(2, '0')
    const { iv, data } = encrypt(plain)
    const file = `att/b-${n}.bin`
    writeFileSync(join(ROOT, 'public', file), data)
    stored = { id: `builtin-${n}`, file, iv }
    byHash.set(hash, stored)
    packed += 1
    bytes += plain.length
    console.log(`  ${att.itemId}  ${att.name}  ${(plain.length / 1024).toFixed(0)}KB → ${file}`)
  } else {
    shared += 1
    console.log(`  ${att.itemId}  ${att.name}  (내용 동일 → ${stored.file} 공유)`)
  }

  const list = (index[att.itemId] ??= [])
  if (list.some((e) => e.id === stored.id)) continue // 같은 카드에 같은 파일이 두 번이면 한 번만
  list.push({
    id: stored.id,
    name: att.name,
    type: att.type,
    size: plain.length,
    file: stored.file,
    iv: stored.iv,
  })
}

// 파일명·호텔명이 드러나지 않도록 목록 자체도 암호화한다
const indexEnc = encrypt(Buffer.from(JSON.stringify(index), 'utf8'))
const checkEnc = encrypt(Buffer.from(CHECK_PLAINTEXT, 'utf8'))

writeFileSync(
  MANIFEST,
  JSON.stringify(
    {
      version: 1,
      count: packed,
      kdf: { salt: salt.toString('base64'), iterations: ITERATIONS },
      check: { iv: checkEnc.iv, data: checkEnc.data.toString('base64') },
      index: { iv: indexEnc.iv, data: indexEnc.data.toString('base64') },
    },
    null,
    2,
  ) + '\n',
  'utf8',
)

console.log(`\n첨부 ${packed}개 (${(bytes / 1024 / 1024).toFixed(2)}MB) 암호화 완료.` + (shared ? ` 같은 내용 ${shared}건은 파일을 공유.` : ''))
console.log(`  ${MANIFEST}`)
console.log('앱에서 암호를 한 번 입력하면 모든 기기에서 열립니다.')
