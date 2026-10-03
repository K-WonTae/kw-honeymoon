import { useCallback } from 'react'
import type { Reservation } from '../types/trip'
import { useSharedData } from '../lib/sharedSync'

export interface ChecklistEntry {
  id: string
  text: string
  checked: boolean
}

/** 첨부파일 메타데이터 (원본은 공용 저장소, 기기에는 오프라인 캐시) */
export interface AttachmentMeta {
  id: string
  name: string
  type: string
  size: number
}

export interface ReservationUserState {
  /** 기기에서 명시적으로 등록/해제한 값. 없으면(undefined) 데이터의 booked 를 따른다 — 예약번호·메모만 적어도 status 는 생기지 않는다 */
  status?: 'pending' | 'done'
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
  /**
   * 예약 완료 여부 — 기기에서 등록한 값이 있으면 그 값, 없으면 데이터의 booked(이미 확정된 예약).
   * 일정 카드·DayBrief·식당·숙소·전체일정·원페이퍼·지도 탭이 전부 이 함수 하나를 본다.
   */
  isReservationDone: (r: Reservation) => boolean
  /** 예약 완료 등록/해제 (공용 저장소와 기기 캐시에 저장, 백업에도 포함) */
  setReservationDone: (r: Reservation, done: boolean) => void
  completedCount: (ids: string[]) => number
}

/** 사용자 입력을 기기에 보관하고 공용 저장소와 자동 동기화한다. */
export function useUserData(): UserDataApi {
  const [data, setData] = useSharedData()
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
          id: `${id}-${crypto.randomUUID()}`,
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
        // status 는 넣지 않는다 — 예약번호·메모만 저장한 엔트리가 booked 기본값을 덮어쓰면 안 된다
        const current: ReservationUserState = reservations[reservationId] ?? { updatedAt: '' }
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

  const isReservationDone = useCallback(
    (r: Reservation): boolean => {
      const s = normalized.reservations?.[r.id]
      // 명시적 status 만 booked 를 덮어쓴다 (예약번호·메모만 있는 엔트리는 booked 그대로)
      return s?.status ? s.status === 'done' : !!r.booked
    },
    [normalized.reservations],
  )

  const setReservationDone = useCallback(
    (r: Reservation, done: boolean) => {
      updateReservationState(r.id, { status: done ? 'done' : 'pending' })
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
    isReservationDone,
    setReservationDone,
    completedCount,
  }
}
