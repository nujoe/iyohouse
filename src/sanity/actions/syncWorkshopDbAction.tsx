'use client'

import { useState } from 'react'
import type { DocumentActionComponent } from 'sanity'

function getNumberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'DB 동기화 중 오류가 발생했습니다.'
}

export const SyncWorkshopDbAction: DocumentActionComponent = (props) => {
  const [isSyncing, setIsSyncing] = useState(false)
  const sourceDocument = props.draft || props.published
  const supabaseWorkshopId =
    typeof sourceDocument?.supabase_workshop_id === 'string'
      ? sourceDocument.supabase_workshop_id
      : ''
  const label = supabaseWorkshopId ? 'DB 정보 업데이트' : 'DB에 워크숍 생성'
  const disabled = isSyncing || !props.ready || !sourceDocument

  if (props.type !== 'workshop') return null

  return {
    label: isSyncing ? 'DB 동기화 중...' : label,
    title: supabaseWorkshopId
      ? '현재 워크숍 정보를 Supabase DB에 업데이트합니다.'
      : 'Supabase DB에 워크숍을 생성하고 UUID를 자동으로 저장합니다.',
    disabled,
    tone: supabaseWorkshopId ? 'default' : 'positive',
    onHandle: async () => {
      if (!sourceDocument || disabled) return

      const price = getNumberValue(sourceDocument.price)
      const capacity = getNumberValue(sourceDocument.capacity)

      if (price === null || price < 0) {
        window.alert('가격을 0 이상의 숫자로 입력한 뒤 다시 시도해 주세요.')
        props.onComplete()
        return
      }

      if (capacity === null || capacity < 1) {
        window.alert('정원을 1명 이상의 숫자로 입력한 뒤 다시 시도해 주세요.')
        props.onComplete()
        return
      }

      setIsSyncing(true)

      try {
        const response = await fetch('/api/admin/sync-workshops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: props.id }),
        })
        const result = await response.json().catch(() => null)

        if (!response.ok || !result?.success) {
          throw new Error(result?.error || 'DB 동기화에 실패했습니다.')
        }

        const syncedId = result.results?.syncedIds?.[0]
        const warnings = Array.isArray(result.results?.warnings)
          ? result.results.warnings.join('\n')
          : ''
        const message = [
          syncedId ? `DB 동기화가 완료되었습니다.\nUUID: ${syncedId}` : 'DB 동기화가 완료되었습니다.',
          warnings,
        ].filter(Boolean).join('\n\n')

        window.alert(message)
      } catch (error) {
        window.alert(getErrorMessage(error))
      } finally {
        setIsSyncing(false)
        props.onComplete()
      }
    },
  }
}
