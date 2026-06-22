'use client'

import { useState } from 'react'
import { useClient } from 'sanity'
import type { DocumentActionComponent } from 'sanity'
import { apiVersion } from '../env'

function getPublishedId(id: string) {
  return id.replace(/^drafts\./, '')
}

function getTargetDocumentIds(props: Parameters<DocumentActionComponent>[0]) {
  const ids = [
    props.published?._id || getPublishedId(props.id),
    props.draft?._id,
  ].filter((id): id is string => typeof id === 'string' && id.length > 0)

  return Array.from(new Set(ids))
}

export const ToggleWorkshopActiveAction: DocumentActionComponent = (props) => {
  const client = useClient({ apiVersion })
  const [isSaving, setIsSaving] = useState(false)
  const sourceDocument = props.draft || props.published
  const isActive = sourceDocument?.isActive !== false
  const nextActive = !isActive
  const disabled = isSaving || !props.ready || !sourceDocument

  if (props.type !== 'workshop') return null

  return {
    label: isSaving ? '노출 상태 변경 중...' : isActive ? '사이트에서 숨기기' : '사이트에 노출하기',
    title: isActive
      ? '이 워크숍을 WORKSHOP 탭과 상세 페이지에서 완전히 숨깁니다.'
      : '이 워크숍을 WORKSHOP 탭과 상세 페이지에 다시 노출합니다.',
    disabled,
    tone: isActive ? 'critical' : 'positive',
    onHandle: async () => {
      if (!sourceDocument || disabled) return

      setIsSaving(true)

      try {
        const transaction = client.transaction()

        for (const documentId of getTargetDocumentIds(props)) {
          transaction.patch(documentId, (patch) => patch.set({ isActive: nextActive }))
        }

        await transaction.commit()
        window.alert(nextActive ? '워크숍이 사이트에 노출됩니다.' : '워크숍이 사이트에서 숨겨졌습니다.')
      } catch (error) {
        window.alert(error instanceof Error ? error.message : '노출 상태 변경에 실패했습니다.')
      } finally {
        setIsSaving(false)
        props.onComplete()
      }
    },
  }
}
