import { defineConfig, type PluginOptions } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { schema } from './schemaTypes'
import { apiVersion, dataset, projectId } from './env'
import { GenerateWorkshopEnglishAction } from './actions/generateWorkshopEnglishAction'
import { SyncWorkshopDbAction } from './actions/syncWorkshopDbAction'
import { ToggleWorkshopActiveAction } from './actions/toggleWorkshopActiveAction'

const plugins: PluginOptions[] = [
  structureTool({
    structure: (S) =>
      S.list()
        .title('IYOHOUSE CMS')
        .items([
          S.listItem()
            .id('workshop-menu')
            .title('워크샵 관리')
            .child(
              S.documentList()
                .id('workshop-list')
                .title('워크샵 목록')
                .filter('_type == "workshop"')
                .defaultOrdering([{ field: 'number', direction: 'desc' }])
            ),
          S.listItem()
            .id('event-menu')
            .title('캘린더 일정 관리')
            .child(
              S.documentList()
                .id('event-list')
                .title('일정 목록')
                .filter('_type == "event"')
                .defaultOrdering([{ field: 'date', direction: 'desc' }])
            ),
        ]),
  }),
]

if (process.env.NODE_ENV !== 'production') {
  plugins.push(visionTool({ defaultApiVersion: apiVersion }))
}

export const config = defineConfig({
  basePath: '/studio',
  projectId,
  dataset,
  apiVersion,
  schema,
  document: {
    actions: (prev, context) =>
      context.schemaType === 'workshop'
        ? [ToggleWorkshopActiveAction, SyncWorkshopDbAction, GenerateWorkshopEnglishAction, ...prev]
        : prev,
  },
  plugins,
})
