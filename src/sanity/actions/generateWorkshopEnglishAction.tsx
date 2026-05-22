'use client'

import { useState } from 'react'
import { useClient } from 'sanity'
import type { DocumentActionComponent } from 'sanity'
import { chatbotConfig } from '@/features/iyohouse-chatbot/config'
import { apiVersion } from '../env'

type GeneratedWorkshopEnglish = {
  titleEn?: string
  tutorEn?: string
  tutorBioEn?: string
  descriptionEn?: unknown[]
  curriculum?: Array<{
    weekLabelEn?: string
    contentEn?: string
  }>
  schedule?: Array<{
    dateEn?: string
    timeEn?: string
  }>
}

function getDraftId(id: string) {
  return id.startsWith('drafts.') ? id : `drafts.${id}`
}

function getPublishedId(id: string) {
  return id.replace(/^drafts\./, '')
}

function toDraftDocument(document: any, id: string) {
  const { _id, _rev, _createdAt, _updatedAt, ...content } = document || {}
  return {
    ...content,
    _id: getDraftId(id),
    _type: 'workshop',
  }
}

function buildPatch(document: any, translation: GeneratedWorkshopEnglish) {
  const patch: Record<string, unknown> = {}

  if (translation.titleEn) patch.titleEn = translation.titleEn
  if (translation.tutorEn) patch.tutorEn = translation.tutorEn
  if (translation.tutorBioEn) patch.tutorBioEn = translation.tutorBioEn
  if (Array.isArray(translation.descriptionEn) && translation.descriptionEn.length > 0) {
    patch.descriptionEn = translation.descriptionEn
  }

  if (Array.isArray(document.curriculum) && document.curriculum.length > 0) {
    patch.curriculum = document.curriculum.map((item: any, index: number) => ({
      ...item,
      ...(translation.curriculum?.[index] || {}),
    }))
  }

  if (Array.isArray(document.schedule) && document.schedule.length > 0) {
    patch.schedule = document.schedule.map((item: any, index: number) => ({
      ...item,
      ...(translation.schedule?.[index] || {}),
    }))
  }

  return patch
}

export const GenerateWorkshopEnglishAction: DocumentActionComponent = (props) => {
  const client = useClient({ apiVersion })
  const [isGenerating, setIsGenerating] = useState(false)
  const sourceDocument = props.draft || props.published
  const disabled = isGenerating || !props.ready || !sourceDocument

  if (props.type !== 'workshop') return null

  return {
    label: isGenerating ? 'Generating English...' : 'Generate English',
    title: 'Generate English fields from the current Korean workshop content',
    disabled,
    tone: 'primary',
    onHandle: async () => {
      if (!sourceDocument || disabled) return

      setIsGenerating(true)

      try {
        const geminiApiKey =
          typeof window === 'undefined'
            ? ''
            : window.localStorage.getItem(chatbotConfig.apiKeyStorageKey) || ''

        const response = await fetch('/api/admin/generate-workshop-english', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            document: sourceDocument,
            geminiApiKey,
          }),
        })
        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'English generation failed')
        }

        const patch = buildPatch(sourceDocument, result.translation || {})
        if (Object.keys(patch).length === 0) {
          throw new Error('No English fields were returned')
        }

        const publishedId = getPublishedId(props.id)
        const draftId = getDraftId(publishedId)

        await client.createIfNotExists(toDraftDocument(sourceDocument, publishedId))
        await client.patch(draftId).set(patch).commit({ autoGenerateArrayKeys: true })

        window.alert('English fields were generated on the draft. Review and publish when ready.')
        props.onComplete()
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'English generation failed')
      } finally {
        setIsGenerating(false)
      }
    },
  }
}
