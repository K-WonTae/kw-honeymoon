interface Props {
  alerts: string[]
}

/** 경고 카드: DST 종료·늦은 체크인·하차역 등 중요 주의사항 */
export function AlertCard({ alerts }: Props) {
  if (!alerts.length) return null
  return (
    <div className="alert-card" role="alert">
      <div className="alert-card-head">
        <span aria-hidden>⚠️</span> 오늘의 주의사항
      </div>
      <ul className="alert-list">
        {alerts.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
    </div>
  )
}
