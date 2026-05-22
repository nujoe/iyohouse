import { NextResponse } from 'next/server'
import { GeminiClient } from '@/features/iyohouse-chatbot/server/gemini-client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type PortableTextBlock = {
  _key: string
  _type: 'block'
  style: 'normal'
  markDefs: []
  children: Array<{
    _key: string
    _type: 'span'
    marks: []
    text: string
  }>
}

type WorkshopTranslationResponse = {
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

function blockToText(block: any) {
  return Array.isArray(block?.children)
    ? block.children.map((child: any) => child?.text || '').join('')
    : ''
}

function toPlainParagraphs(value: unknown) {
  return Array.isArray(value)
    ? value.map(blockToText).map((text) => text.trim()).filter(Boolean)
    : []
}

function toPortableText(paragraphs: unknown[], prefix: string): PortableTextBlock[] {
  return paragraphs
    .map((entry) => typeof entry === 'string' ? entry.trim() : '')
    .filter(Boolean)
    .map((text, index) => ({
      _key: `${prefix}Block${index}`,
      _type: 'block' as const,
      style: 'normal' as const,
      markDefs: [],
      children: [
        {
          _key: `${prefix}Span${index}`,
          _type: 'span' as const,
          marks: [],
          text,
        },
      ],
    }))
}

function getRequestApiKey(body: any) {
  const serverApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
  const allowClientApiKey =
    process.env.CHATBOT_ALLOW_CLIENT_GEMINI_KEY !== 'false' &&
    process.env.ALLOW_CLIENT_GEMINI_KEY !== 'false'

  if (serverApiKey) return serverApiKey
  if (allowClientApiKey && typeof body?.geminiApiKey === 'string') return body.geminiApiKey.trim()
  return ''
}

function extractJson(text: string): WorkshopTranslationResponse {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const jsonText = fenced?.[1] || trimmed
  const firstBrace = jsonText.indexOf('{')
  const lastBrace = jsonText.lastIndexOf('}')

  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error('Translation response did not include JSON')
  }

  return JSON.parse(jsonText.slice(firstBrace, lastBrace + 1))
}

function buildTranslationInput(document: any) {
  return {
    title: document.title || '',
    tutor: document.tutor || '',
    tutorBio: document.tutorBio || '',
    description: toPlainParagraphs(document.description),
    curriculum: Array.isArray(document.curriculum)
      ? document.curriculum.map((item: any) => ({
          weekLabel: item?.weekLabel || '',
          content: item?.content || '',
        }))
      : [],
    schedule: Array.isArray(document.schedule)
      ? document.schedule.map((item: any) => ({
          date: item?.date || '',
          time: item?.time || '',
        }))
      : [],
  }
}

function normalizeTranslation(parsed: WorkshopTranslationResponse) {
  return {
    titleEn: typeof parsed.titleEn === 'string' ? parsed.titleEn.trim() : '',
    tutorEn: typeof parsed.tutorEn === 'string' ? parsed.tutorEn.trim() : '',
    tutorBioEn: typeof parsed.tutorBioEn === 'string' ? parsed.tutorBioEn.trim() : '',
    descriptionEn: toPortableText(Array.isArray(parsed.descriptionEn) ? parsed.descriptionEn : [], 'enDescription'),
    curriculum: Array.isArray(parsed.curriculum)
      ? parsed.curriculum.map((item) => ({
          weekLabelEn: typeof item?.weekLabelEn === 'string' ? item.weekLabelEn.trim() : '',
          contentEn: typeof item?.contentEn === 'string' ? item.contentEn.trim() : '',
        }))
      : [],
    schedule: Array.isArray(parsed.schedule)
      ? parsed.schedule.map((item) => ({
          dateEn: typeof item?.dateEn === 'string' ? item.dateEn.trim() : '',
          timeEn: typeof item?.timeEn === 'string' ? item.timeEn.trim() : '',
        }))
      : [],
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const document = body?.document

    if (!document || document._type !== 'workshop') {
      return NextResponse.json({ success: false, error: 'workshop document is required' }, { status: 400 })
    }

    const apiKey = getRequestApiKey(body)
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Gemini API key is required' }, { status: 400 })
    }

    const input = buildTranslationInput(document)
    const model = new GeminiClient({
      apiKey,
      model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
      thinkingLevel: process.env.GEMINI_THINKING_LEVEL || 'low',
    })

    const result = await model.generateContent({
      systemInstruction: [
        'You translate IYOHOUSE workshop CMS fields from Korean to natural English.',
        'Preserve brand names, person names, handles, URLs, dates, and prices unless a direct English rendering is clearly expected.',
        'Return only valid JSON. Do not include markdown, commentary, or extra keys.',
        'Schema: {"titleEn":"string","tutorEn":"string","tutorBioEn":"string","descriptionEn":["paragraph"],"curriculum":[{"weekLabelEn":"string","contentEn":"string"}],"schedule":[{"dateEn":"string","timeEn":"string"}]}.',
        'The curriculum and schedule arrays must keep the same order and length as the input arrays.',
      ].join(' '),
      contents: [
        {
          role: 'user',
          parts: [{ text: JSON.stringify(input) }],
        },
      ],
    })

    const text = result.parts.map((part: { text?: string }) => part.text || '').join('\n')
    const translation = normalizeTranslation(extractJson(text))

    return NextResponse.json({ success: true, translation })
  } catch (error) {
    console.error('Workshop English generation failed:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to generate English fields' },
      { status: 500 }
    )
  }
}
