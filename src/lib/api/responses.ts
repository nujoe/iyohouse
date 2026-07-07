import { NextResponse } from 'next/server'

export const noStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
} as const

export function noStoreJson(
  body: unknown,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers)
  headers.set('Cache-Control', noStoreHeaders['Cache-Control'])

  return NextResponse.json(body, {
    ...init,
    headers,
  })
}
