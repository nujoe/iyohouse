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
      name: 'dates',
      title: '추가 날짜 리스트',
      type: 'array',
      of: [{ type: 'date' }],
      description: '동일한 내용의 일정이 열리는 추가 날짜들을 선택하세요.',
      validation: (Rule) => Rule.unique(),
    }),
    defineField({
      name: 'time',
      title: '시간',
      type: 'string',
      description: '예: 1p - 5p',
    }),
    defineField({
      name: 'author',
      title: '작성자',
      type: 'string',
      options: {
        list: ['현', '가은', '가현', '연서', '준'],
      },
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
      dates: 'dates',
      time: 'time',
    },
    prepare(selection) {
      const { title, date, dates, time } = selection
      let dateDisplay = date;
      if (Array.isArray(dates) && dates.length > 0) {
        dateDisplay = `${date} 외 ${dates.length}일`;
      }
      return {
        title: dateDisplay ? `[${dateDisplay}] ${title}` : title,
        subtitle: time,
      }
    },
  },
})
