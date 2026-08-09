export interface FxSetting {
  eurToKrw: number
  updatedAt: string
}

export const FX_STORAGE_KEY = 'honeymoon:fx:v1'
export const DEFAULT_EUR_TO_KRW = 1450

export function eurToKrwText(eur: number, rate: number): string {
  const krw = Math.round(eur * rate)
  return `₩${krw.toLocaleString('ko-KR')}`
}

export function formatEur(eur: number): string {
  return `€${eur.toLocaleString('ko-KR')}`
}
