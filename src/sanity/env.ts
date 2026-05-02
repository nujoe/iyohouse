export const apiVersion =
  process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2024-01-01'

export const dataset = assertValue(
  process.env.NEXT_PUBLIC_SANITY_DATASET,
  'Missing environment variable: NEXT_PUBLIC_SANITY_DATASET'
)

export const projectId = assertValue(
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  'Missing environment variable: NEXT_PUBLIC_SANITY_PROJECT_ID'
)

function assertValue<T>(v: T | undefined, errorMessage: string): T {
  if (v === undefined || v === '') {
    // 빌드 타임이나 로컬 환경에서 변수가 없을 경우 안내 메시지만 출력하고 앱 실행은 유지함
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[Sanity Configuration] ${errorMessage}. Using placeholder value.`);
    }
    return 'placeholder' as any
  }
  return v
}
