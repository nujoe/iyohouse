function normalizeInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value)
  }
  return null
}

export function parseCapacity(capacityValue: unknown, schedule?: unknown): number | null {
  // 1. 이미 숫자 타입인 경우 처리
  if (typeof capacityValue === 'number' && Number.isFinite(capacityValue)) {
    return Math.round(capacityValue)
  }

  // 2. 문자열 타입인 경우 처리
  if (typeof capacityValue === 'string') {
    const trimmed = capacityValue.trim()
    if (!trimmed) return null

    // 2-1. 순수 숫자로만 구성된 문자열 처리
    if (/^\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10)
    }

    // 2-2. 일정(schedule) 배열 내 개별 세션의 capacity 합산 시도
    if (Array.isArray(schedule) && schedule.length > 0) {
      let sum = 0
      let hasValidSessionCapacity = false
      for (const session of schedule) {
        const cap = normalizeInteger(session?.capacity)
        if (cap !== null && cap > 0) {
          sum += cap
          hasValidSessionCapacity = true
        }
      }
      if (hasValidSessionCapacity && sum > 0) {
        return sum
      }
    }

    // 2-3. 문자열 내 모든 숫자를 추출하여 합산 시도 (예: "목요반 12명 금요반 12명" -> 12 + 12 = 24)
    const matches = trimmed.match(/\d+/g)
    if (matches && matches.length > 0) {
      const sum = matches.reduce((acc, curr) => acc + parseInt(curr, 10), 0)
      if (sum > 0) {
        return sum
      }
    }
  }

  return null
}
