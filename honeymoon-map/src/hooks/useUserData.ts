import { useCallback } from 'react'
import { useLocalStorage } from './useLocalStorage'

export interface ChecklistEntry {
  id: string
  text: string
  checked: boolean
}

/** 첨부파일 메타데이터 (바이너리는 IndexedDB에 별도 저장) */
export interface AttachmentMeta {
  id: string
  name: string
  type: string
  size: number
}

export interface ReservationUserState {
  status: 'pending' | 'done'
  confirmationNo?: string
  memo?: string
  updatedAt: string
}

export interface UserData {
  completed: Record<string, boolean>
  memos: Record<string, string>
  checklists: Record<string, ChecklistEntry[]>
  attachments: Record<string, AttachmentMeta[]>
  reservations: Record<string, ReservationUserState>
}

const INITIAL: UserData = {
  completed: {},
  memos: {},
  checklists: {},
  attachments: {},
  reservations: {},
}

const STORAGE_KEY = 'honeymoon:userdata:v1'

export interface UserDataApi {
  data: UserData
  isCompleted: (id: string) => boolean
  toggleCompleted: (id: string) => void
  getMemo: (id: string) => string
  setMemo: (id: string, text: string) => void
  getChecklist: (id: string) => ChecklistEntry[]
  addChecklist: (id: string, text: string) => void
  toggleChecklist: (id: string, entryId: string) => void
  removeChecklist: (id: string, entryId: string) => void
  getAttachments: (id: string) => AttachmentMeta[]
  addAttachment: (id: string, meta: AttachmentMeta) => void
  removeAttachment: (id: string, attId: string) => void
  getReservationState: (reservationId: string) => ReservationUserState
  setReservationStatus: (reservationId: string, status: 'pending' | 'done') => void
  setReservationConfirmation: (reservationId: string, confirmationNo: string) => void
  setReservationMemo: (reservationId: string, memo: string) => void
  completedCount: (ids: string[]) => number
}

/** 사용자 입력(방문 체크·메모·체크리스트)을 localStorage 에 영속화 */
export function useUserData(): UserDataApi {
  const [data, setData] = useLocalStorage<UserData>(STORAGE_KEY, INITIAL)
  const normalized: UserData = {
    completed: data.completed ?? {},
    memos: data.memos ?? {},
    checklists: data.checklists ?? {},
    attachments: data.attachments ?? {},
    reservations: data.reservations ?? {},
  }

  const isCompleted = useCallback((id: string) => !!normalized.completed[id], [normalized.completed])

  const toggleCompleted = useCallback(
    (id: string) => {
      setData((prev) => ({ ...prev, completed: { ...prev.completed, [id]: !prev.completed[id] } }))
    },
    [setData],
  )

  const getMemo = useCallback((id: string) => normalized.memos[id] ?? '', [normalized.memos])

  const setMemo = useCallback(
    (id: string, text: string) => {
      setData((prev) => ({ ...prev, memos: { ...prev.memos, [id]: text } }))
    },
    [setData],
  )

  const getChecklist = useCallback((id: string) => normalized.checklists[id] ?? [], [normalized.checklists])

  const addChecklist = useCallback(
    (id: string, text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      setData((prev) => {
        const list = prev.checklists[id] ?? []
        const entry: ChecklistEntry = {
          id: `${id}-c${list.length}-${trimmed.length}`,
          text: trimmed,
          checked: false,
        }
        return { ...prev, checklists: { ...prev.checklists, [id]: [...list, entry] } }
      })
    },
    [setData],
  )

  const toggleChecklist = useCallback(
    (id: string, entryId: string) => {
      setData((prev) => {
        const list = prev.checklists[id] ?? []
        return {
          ...prev,
          checklists: {
            ...prev.checklists,
            [id]: list.map((e) => (e.id === entryId ? { ...e, checked: !e.checked } : e)),
          },
        }
      })
    },
    [setData],
  )

  const removeChecklist = useCallback(
    (id: string, entryId: string) => {
      setData((prev) => {
        const list = prev.checklists[id] ?? []
        return {
          ...prev,
          checklists: { ...prev.checklists, [id]: list.filter((e) => e.id !== entryId) },
        }
      })
    },
    [setData],
  )

  const getAttachments = useCallback(
    (id: string) => normalized.attachments?.[id] ?? [],
    [normalized.attachments],
  )

  const addAttachment = useCallback(
    (id: string, meta: AttachmentMeta) => {
      setData((prev) => {
        const list = prev.attachments?.[id] ?? []
        return { ...prev, attachments: { ...(prev.attachments ?? {}), [id]: [...list, meta] } }
      })
    },
    [setData],
  )

  const removeAttachment = useCallback(
    (id: string, attId: string) => {
      setData((prev) => {
        const list = prev.attachments?.[id] ?? []
        return {
          ...prev,
          attachments: { ...(prev.attachments ?? {}), [id]: list.filter((a) => a.id !== attId) },
        }
      })
    },
    [setData],
  )

  const completedCount = useCallback(
    (ids: string[]) => ids.reduce((n, id) => n + (normalized.completed[id] ? 1 : 0), 0),
    [normalized.completed],
  )

  const getReservationState = useCallback(
    (reservationId: string): ReservationUserState =>
      normalized.reservations?.[reservationId] ?? {
        status: 'pending',
        updatedAt: '',
      },
    [normalized.reservations],
  )

  const updateReservationState = useCallback(
    (reservationId: string, patch: Partial<ReservationUserState>) => {
      setData((prev) => {
        const reservations = prev.reservations ?? {}
        const current = reservations[reservationId] ?? { status: 'pending', updatedAt: '' }
        return {
          ...prev,
          reservations: {
            ...reservations,
            [reservationId]: {
              ...current,
              ...patch,
              updatedAt: new Date().toISOString(),
            },
          },
        }
      })
    },
    [setData],
  )

  const setReservationStatus = useCallback(
    (reservationId: string, status: 'pending' | 'done') => {
      updateReservationState(reservationId, { status })
    },
    [updateReservationState],
  )

  const setReservationConfirmation = useCallback(
    (reservationId: string, confirmationNo: string) => {
      updateReservationState(reservationId, { confirmationNo })
    },
    [updateReservationState],
  )

  const setReservationMemo = useCallback(
    (reservationId: string, memo: string) => {
      updateReservationState(reservationId, { memo })
    },
    [updateReservationState],
  )

  return {
    data: normalized,
    isCompleted,
    toggleCompleted,
    getMemo,
    setMemo,
    getChecklist,
    addChecklist,
    toggleChecklist,
    removeChecklist,
    getAttachments,
    addAttachment,
    removeAttachment,
    getReservationState,
    setReservationStatus,
    setReservationConfirmation,
    setReservationMemo,
    completedCount,
  }
}
