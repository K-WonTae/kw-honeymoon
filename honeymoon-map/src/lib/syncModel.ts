import type { UserData } from '../hooks/useUserData'

export type Cells = Record<string, unknown>
export interface SyncOperation { id: string; cells: Cells; insertOnly?: boolean }
export interface SharedDocument { version: 1; cells: Cells; applied: Record<string, true> }
export const emptyUserData = (): UserData => ({ completed: {}, memos: {}, checklists: {}, attachments: {}, reservations: {} })
export const cellKey = (...path: string[]) => JSON.stringify(path)

// Individual reservation fields, checklist entries and files merge independently.
export function toCells(data: UserData): Cells {
  const cells: Cells = {}
  for (const group of ['completed', 'memos'] as const) {
    for (const [id, value] of Object.entries(data[group] ?? {})) cells[cellKey(group, id)] = value
  }
  for (const group of ['attachments', 'checklists'] as const) {
    for (const [id, entries] of Object.entries(data[group] ?? {})) {
      for (const entry of entries) cells[cellKey(group, id, entry.id)] = entry
    }
  }
  for (const [id, state] of Object.entries(data.reservations ?? {})) {
    for (const [field, value] of Object.entries(state)) cells[cellKey('reservations', id, field)] = value
  }
  return cells
}

export function fromCells(cells: Cells): UserData {
  const data = emptyUserData()
  for (const [key, value] of Object.entries(cells)) {
    if (value === null) continue // tombstones prevent an old device restoring deleted files
    const [group, id, field] = JSON.parse(key) as string[]
    if (group === 'completed') data.completed[id] = value as boolean
    if (group === 'memos') data.memos[id] = value as string
    if (group === 'reservations') {
      data.reservations[id] ??= { updatedAt: '' }
      Object.assign(data.reservations[id], { [field]: value })
    }
    if (group === 'checklists') (data.checklists[id] ??= []).push(value as UserData['checklists'][string][number])
    if (group === 'attachments') (data.attachments[id] ??= []).push(value as UserData['attachments'][string][number])
  }
  return data
}

export function diffCells(before: Cells, after: Cells): Cells {
  const changes: Cells = {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes[key] = after[key] ?? null
  }
  return changes
}

export function applyOperation(doc: SharedDocument, op: SyncOperation): SharedDocument {
  if (doc.applied[op.id]) return doc // retry after a lost HTTP response cannot undo a later edit
  const cells = { ...doc.cells }
  for (const [key, value] of Object.entries(op.cells)) {
    if (!op.insertOnly || !Object.prototype.hasOwnProperty.call(cells, key)) cells[key] = value
  }
  return { version: 1, cells, applied: { ...doc.applied, [op.id]: true } }
}

export function validCells(value: unknown): value is Cells {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const safeId = (s: unknown) => typeof s === 'string' && s.length > 0 && s.length <= 200 && !['__proto__', 'prototype', 'constructor'].includes(s)
  return Object.entries(value).every(([key, val]) => {
    let path: unknown
    try { path = JSON.parse(key) } catch { return false }
    if (!Array.isArray(path) || !path.every(safeId)) return false
    const [group, , field] = path
    if (group === 'completed') return path.length === 2 && (val === null || typeof val === 'boolean')
    if (group === 'memos') return path.length === 2 && (val === null || typeof val === 'string')
    if (group === 'reservations') return path.length === 3 && ['status', 'memo', 'confirmationNo', 'updatedAt'].includes(field) &&
      (val === null || (typeof val === 'string' && (field !== 'status' || ['done', 'pending'].includes(val))))
    if (group !== 'attachments' && group !== 'checklists') return false
    if (path.length !== 3) return false
    if (val === null) return true
    if (!val || typeof val !== 'object' || Array.isArray(val)) return false
    const entry = val as Record<string, unknown>
    if (entry.id !== field) return false
    if (group === 'checklists') return typeof entry.text === 'string' && typeof entry.checked === 'boolean'
    return /^att-[a-zA-Z0-9-]{1,180}$/.test(field) && typeof entry.name === 'string' && typeof entry.type === 'string' &&
      typeof entry.size === 'number' && entry.size >= 0 && entry.size <= 25 * 1024 * 1024
  })
}
