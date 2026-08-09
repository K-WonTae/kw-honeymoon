import { useCallback, useEffect, useState } from 'react'

/**
 * localStorage 영속 상태 훅.
 * 사용자 입력(방문 체크·메모·체크리스트)을 새로고침 후에도 유지하기 위해 사용.
 * 지시서 §1: 사용자 입력은 localStorage 에 영속화.
 */
export function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* 무시 */
    }
  }, [key, value])

  const set = useCallback((v: T | ((prev: T) => T)) => {
    setValue((prev) => (typeof v === 'function' ? (v as (p: T) => T)(prev) : v))
  }, [])

  return [value, set]
}
