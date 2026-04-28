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
            .replace(/\s+/g, '-') // 공백을 -로 변경
            .replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣-]/g, '') // 한글, 영문, 숫자, - 제외하고 제거
            .slice(0, 96),
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'isClosed',
      title: '마감 여부',
      type: 'boolean',
      initialValue: false,
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
      name: 'tags',
      title: '태그',
      type: 'array',
      of: [{ type: 'string' }],
      options: {
        list: [
          { title: 'AI', value: 'AI' },
          { title: 'WORKSHOP', value: 'WORKSHOP' },
          { title: 'GRAPHIC', value: 'GRAPHIC' },
          { title: 'VFX', value: 'VFX' },
          { title: 'PHOTO', value: 'PHOTO' },
          { title: 'VIDEO', value: 'VIDEO' },
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
      name: 'tutorBio',
      title: '튜터 소개',
      type: 'text',
      rows: 5,
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
              name: 'content',
              title: '내용',
              type: 'text',
              rows: 4,
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'capacity',
      title: '정원 (명)',
      type: 'number',
    }),
    defineField({
      name: 'price',
      title: '가격 (원)',
      type: 'number',
      description: '예: 150000',
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
              name: 'time',
              title: '시간',
              type: 'string',
              description: '예: 2p - 6p',
            }),
          ],
        }),
      ],
    }),
    // defineField({
    //   name: 'applyUrl',
    //   title: '신청 링크 URL',
    //   type: 'url',
    // }),
  ],
  orderings: [
    {
      title: '워크샵 번호 (최신순)',
      name: 'numberDesc',
      by: [{ field: 'number', direction: 'desc' }],
    },
  ],
})
