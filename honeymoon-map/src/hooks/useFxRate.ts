import { useCallback, useEffect } from 'react'
import { DEFAULT_EUR_TO_KRW, FX_STORAGE_KEY, type FxSetting } from '../lib/money'
import { useLocalStorage } from './useLocalStorage'

function initialFx(): FxSetting {
  return { eurToKrw: DEFAULT_EUR_TO_KRW, updatedAt: new Date().toISOString() }
}

function normalizeFx(v: FxSetting): FxSetting {
  const n = Number(v?.eurToKrw)
  return {
    eurToKrw: Number.isFinite(n) && n > 0 ? n : DEFAULT_EUR_TO_KRW,
    updatedAt: v?.updatedAt || new Date().toISOString(),
  }
}

export function useFxRate() {
  const [fx, setFx] = useLocalStorage<FxSetting>(FX_STORAGE_KEY, initialFx())

  useEffect(() => {
    const next = normalizeFx(fx)
    if (next.eurToKrw !== fx.eurToKrw || next.updatedAt !== fx.updatedAt) setFx(next)
  }, [fx, setFx])

  const saveRate = useCallback(
    (eurToKrw: number) => {
      setFx({ eurToKrw, updatedAt: new Date().toISOString() })
    },
    [setFx],
  )

  return { fx: normalizeFx(fx), saveRate }
}
