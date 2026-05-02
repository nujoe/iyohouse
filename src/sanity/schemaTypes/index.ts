import { type SchemaTypeDefinition } from 'sanity'
import { workshopType } from './workshop'
import { eventType } from './event'

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [workshopType, eventType],
}
