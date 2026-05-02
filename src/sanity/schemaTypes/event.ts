import { defineField, defineType } from 'sanity'

export const eventType = defineType({
  name: 'event',
  title: '일정',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: '일정 제목',
      type: 'string',
      description: '예: work shop',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'date',
      title: '날짜',
      type: 'date',
      description: '달력에 표시될 날짜 선택',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'time',
      title: '시간',
      type: 'string',
      description: '예: 1p - 5p',
    }),
    defineField({
      name: 'description',
      title: '설명',
      type: 'text',
      rows: 3,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      date: 'date',
      time: 'time',
    },
    prepare(selection) {
      const { title, date, time } = selection
      return {
        title: `[${date}] ${title}`,
        subtitle: time,
      }
    },
  },
})
