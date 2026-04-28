import { createClient } from 'next-sanity'
import { apiVersion, dataset, projectId } from './env'

export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true, // 배포 후 빠른 캐싱을 위해 true, 실시간 미리보기 필요 시 false
})
