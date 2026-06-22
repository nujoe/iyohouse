import { defineField, defineType } from 'sanity'

export const workshopType = defineType({
  name: 'workshop',
  title: '워크샵',
  type: 'document',
  fields: [
    defineField({
      name: 'number',
      title: '워크샵 번호',
      type: 'number',
      description: '최신등록일수록 가장 높은숫자 입력',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'title',
      title: '워크샵 제목',
      type: 'string',
      description: '워크샵 제목 입력',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'titleEn',
      title: '워크샵 제목 (영문)',
      type: 'string',
      description: '영문 페이지에서 우선 노출되는 제목입니다. 비워두면 한글 제목이 표시됩니다.',
    }),
    defineField({
      name: 'slug',
      title: 'URL 슬러그',
      type: 'slug',
      description: 'url뒤에 붙는 링크 이름( generate -> 예제를 숫자에 맞게 변경)',
      options: {
        source: 'title',
        maxLength: 96,
        slugify: (input) =>
          input
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣-]/g, '')
            .slice(0, 96),
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'seo',
      title: 'SEO / 공유 설정',
      type: 'object',
      description: '검색 결과와 카카오톡/문자 공유 미리보기에서 우선 사용되는 값입니다. 비워두면 워크샵 기본 정보로 자동 생성됩니다.',
      options: {
        collapsible: true,
        collapsed: false,
      },
      fields: [
        defineField({
          name: 'title',
          title: '검색 제목',
          type: 'string',
          description: '예: AI.zip 그래픽 워크숍 | IYOHOUSE',
          validation: (Rule) => Rule.max(70),
        }),
        defineField({
          name: 'description',
          title: '검색 소개문',
          type: 'text',
          rows: 3,
          description: '구글 검색 결과와 공유 카드에 표시될 120~155자 소개문',
          validation: (Rule) => Rule.max(155),
        }),
        defineField({
          name: 'image',
          title: '공유 이미지',
          type: 'image',
          description: '권장 비율 1200x630. 비워두면 포스터 이미지를 사용합니다.',
          options: {
            hotspot: true,
          },
        }),
        defineField({
          name: 'imageAlt',
          title: '공유 이미지 대체 텍스트',
          type: 'string',
          description: '이미지를 볼 수 없는 환경과 접근성용 설명',
          validation: (Rule) => Rule.max(120),
        }),
        defineField({
          name: 'noindex',
          title: '검색 노출 제외',
          type: 'boolean',
          initialValue: false,
          description: '테스트/비공개 워크샵이면 켭니다.',
        }),
      ],
    }),
    defineField({
      name: 'supabase_workshop_id',
      title: 'DB 워크숍 UUID',
      type: 'string',
      readOnly: true,
      description: 'Sanity Studio의 "DB에 워크숍 생성" / "DB 정보 업데이트" 버튼으로 자동 입력됩니다. 결제 연동에 필요한 내부 연결값입니다.',
      validation: (Rule) => Rule.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, { name: 'uuid', invert: false }),
    }),
    defineField({
      name: 'isActive',
      title: '사이트 노출',
      type: 'boolean',
      initialValue: true,
      description: '끄면 WORKSHOP 탭과 워크숍 상세/SEO 페이지에서 완전히 숨겨집니다.',
    }),
    defineField({
      name: 'isClosed',
      title: '마감 여부',
      type: 'boolean',
      initialValue: false,
      description: '사이트에는 노출하되 신청 버튼만 마감으로 표시합니다.',
    }),
    defineField({
      name: 'poster',
      title: '포스터 이미지',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'posterAlt',
      title: '포스터 대체 텍스트',
      type: 'string',
      description: '예: AI.zip 그래픽 워크숍 포스터',
      validation: (Rule) => Rule.max(120),
    }),
    defineField({
      name: 'tags',
      title: '태그',
      type: 'array',
      of: [{ type: 'string' }],
      options: {
        list: [
          { title: 'WORKSHOP', value: 'WORKSHOP' },
          { title: 'TALK', value: 'TALK' },
          { title: 'IYOCA', value: 'IYOCA' },
        ],
      },
    }),
    defineField({
      name: 'tutor',
      title: '튜터 이름',
      type: 'string',
      description: '예: 현 @hyun2xyz',
    }),
    defineField({
      name: 'tutorEn',
      title: '튜터 이름 (영문)',
      type: 'string',
      description: '영문 페이지에서 우선 노출되는 튜터 표기입니다. 비워두면 한글 튜터 이름이 표시됩니다.',
    }),
    defineField({
      name: 'tutorBio',
      title: '튜터 소개',
      type: 'text',
      rows: 5,
    }),
    defineField({
      name: 'tutorBioEn',
      title: '튜터 소개 (영문)',
      type: 'text',
      rows: 5,
      description: '영문 페이지에서 우선 노출되는 튜터 소개입니다. 비워두면 한글 소개가 표시됩니다.',
    }),
    defineField({
      name: 'description',
      title: '워크샵 설명',
      type: 'array',
      of: [
        {
          type: 'block',
        },
      ],
    }),
    defineField({
      name: 'descriptionEn',
      title: '워크샵 설명 (영문)',
      type: 'array',
      description: '영문 페이지에서 우선 노출되는 설명입니다. 비워두면 한글 설명이 표시됩니다.',
      of: [
        {
          type: 'block',
        },
      ],
    }),
    defineField({
      name: 'curriculum',
      title: '커리큘럼',
      type: 'array',
      of: [
        defineField({
          name: 'week',
          title: '주차',
          type: 'object',
          fields: [
            defineField({
              name: 'weekLabel',
              title: '주차 레이블',
              type: 'string',
              description: '예: 1주차 (4/11, 4/12)',
            }),
            defineField({
              name: 'weekLabelEn',
              title: '주차 레이블 (영문)',
              type: 'string',
              description: '예: Week 1 (4/11, 4/12)',
            }),
            defineField({
              name: 'content',
              title: '내용',
              type: 'text',
              rows: 4,
            }),
            defineField({
              name: 'contentEn',
              title: '내용 (영문)',
              type: 'text',
              rows: 4,
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'capacity',
      title: '정원 표시 문구',
      type: 'string',
      description: '사이트 상세에 그대로 표시되는 문구입니다. 예: 24명 또는 목요반 12명 / 금요반 12명. 실제 마감 계산은 아래 일정별 정원 숫자를 사용합니다.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'price',
      title: '가격 (원)',
      type: 'number',
      description: '예: 150000',
      validation: (Rule) => Rule.required().integer().min(0),
    }),
    defineField({
      name: 'schedule',
      title: '일정',
      type: 'array',
      description: '일정 선택란에 들어가는 날짜 ( 예 : 목요반 / 일요반 )',
      of: [
        defineField({
          name: 'session',
          title: '회차',
          type: 'object',
          fields: [
            defineField({
              name: 'date',
              title: '날짜',
              type: 'string',
              description: '예: 2026-04-11',
            }),
            defineField({
              name: 'dateEn',
              title: '날짜 (영문)',
              type: 'string',
              description: '예: Thu class / Sun class',
            }),
            defineField({
              name: 'time',
              title: '시간',
              type: 'string',
              description: '예: 2p - 6p',
            }),
            defineField({
              name: 'timeEn',
              title: '시간 (영문)',
              type: 'string',
              description: '예: 2 PM - 6 PM',
            }),
            defineField({
              name: 'capacity',
              title: '일정별 정원 (명)',
              type: 'number',
              description: '목요반/일요반처럼 각 일정마다 받을 수 있는 인원입니다. 비워두면 워크숍 전체 정원을 사용합니다.',
              validation: (Rule) => Rule.integer().min(1),
            }),
          ],
        }),
      ],
    }),
  ],
  orderings: [
    {
      title: '워크샵 번호 (최신순)',
      name: 'numberDesc',
      by: [{ field: 'number', direction: 'desc' }],
    },
  ],
})
