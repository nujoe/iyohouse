export type LegacyPosterMeta = {
  src: string
  width: number
  height: number
}

const legacyPosterMeta: Record<number, LegacyPosterMeta> = {
  1: { src: '/assets/01.png', width: 720, height: 900 },
  2: { src: '/assets/02.png', width: 1080, height: 1350 },
  3: { src: '/assets/03.png', width: 720, height: 900 },
  4: { src: '/assets/04.png', width: 1080, height: 1350 },
  5: { src: '/assets/05.png', width: 1080, height: 1350 },
  6: { src: '/assets/06.png', width: 578, height: 720 },
  7: { src: '/assets/07.png', width: 1080, height: 1350 },
  8: { src: '/assets/08.png', width: 1440, height: 1800 },
  9: { src: '/assets/09.png', width: 1164, height: 1456 },
  10: { src: '/assets/10.png', width: 1440, height: 1756 },
  11: { src: '/assets/11.png', width: 1080, height: 1350 },
  12: { src: '/assets/12.png', width: 3508, height: 4385 },
  13: { src: '/assets/13.png', width: 1080, height: 1350 },
  14: { src: '/assets/14.png', width: 1080, height: 1350 },
  15: { src: '/assets/15.png', width: 2250, height: 2814 },
  16: { src: '/assets/16.png', width: 864, height: 1080 },
  17: { src: '/assets/17.png', width: 1080, height: 1350 },
  18: { src: '/assets/18.webp', width: 1600, height: 1987 },
  19: { src: '/assets/19.png', width: 1080, height: 1350 },
  20: { src: '/assets/20.png', width: 1080, height: 1350 },
  21: { src: '/assets/21.png', width: 4500, height: 5625 },
  22: { src: '/assets/22.png', width: 4500, height: 5625 },
  23: { src: '/assets/23.png', width: 1080, height: 1350 },
  24: { src: '/assets/24.webp', width: 1600, height: 2263 },
}

export function getLegacyPosterMeta(id: number): LegacyPosterMeta {
  return legacyPosterMeta[id] || {
    src: `/assets/${id.toString().padStart(2, '0')}.png`,
    width: 1080,
    height: 1350,
  }
}
