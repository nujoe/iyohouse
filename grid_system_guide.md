# IYOHOUSE Grid System Guide

이 문서는 IYOHOUSE의 동적 격자 시스템을 다음 수정자가 빠르게 이해하고 수정할 수 있도록 정리한 운영 가이드입니다.

핵심은 CSS Grid가 아니라 **CSS 변수를 좌표계처럼 사용하고, preset 전환 시 변수값만 바꿔 격자선과 페이지 셀을 함께 움직이는 방식**입니다.

---

## 1. 핵심 파일

| 파일 | 역할 |
| --- | --- |
| `src/styles/00-base.css` | 전역 격자 변수 기본값 정의 |
| `src/lib/gridPresets.ts` | `main`, `member`, `workshop`, `diary`, `contact`별 좌표값 정의 |
| `src/hooks/useGridLayout.ts` | 현재 preset 값을 CSS 변수로 주입 |
| `src/components/GridLines.tsx` | 실제 격자선 DOM 생성 |
| `src/styles/04-grid-cells.css` | 데스크톱 격자선, 마커, 셀 배치 기본 규칙 |
| `src/styles/11-member-contact-sidebar.css` | member/contact/mobile 보조 마커와 일부 모바일 레이아웃 |
| `src/styles/12-mobile-scroll-layout.css` | 모바일 전용 스크롤, 격자선 노출, 전환 정책 |

수정 우선순위는 보통 다음 순서입니다.

1. 좌표 자체를 바꾸려면 `gridPresets.ts`
2. 격자선/마커 모양을 바꾸려면 `04-grid-cells.css`
3. 모바일에서만 다르게 보이면 `12-mobile-scroll-layout.css`
4. 모바일 member/contact 내부 구분선이면 `11-member-contact-sidebar.css`

---

## 2. 변수 흐름

격자 좌표는 아래 흐름으로 전달됩니다.

```text
00-base.css 기본값
  -> gridPresets.ts preset별 좌표
  -> useGridLayout.ts에서 CSS 변수 문자열 생성
  -> HomePageContent의 app-container style + :root style로 주입
  -> GridLines와 cell CSS가 var(...)로 참조
```

`useGridLayout.ts`에서 주입하는 주요 변수:

```ts
{
    "--line-x-1": currentPreset.line1,
    "--line-x-3": currentPreset.line3,
    "--line-x-4": lineX4,
    "--top-row-1": logoHeight,
    "--top-row-2": currentPreset.top2,
    "--line-x-center": "calc(50% - var(--line-gap) / 2)",
    "--intersect": dynamicColor,
}
```

주의할 점:

- `--top-row-1`은 고정값이 아니라 실제 로고 높이(`logoHeight`)로 갱신됩니다.
- `--top-row-2`는 preset별 두 번째 가로선 위치입니다.
- `--line-x-1`, `--line-x-3`는 보이는 세로 격자선 위치입니다.
- `--line-x-4`는 현재 `GridLines`에서 직접 선을 만들지는 않지만, 헤더/보조 레이아웃 계산에 사용될 수 있습니다.
- `--line-x-2` 관련 CSS는 남아 있지만 현재 `GridLines.tsx`에서는 `top-v-2`가 렌더링되지 않습니다. 새 중간 마커를 추가할 때만 다시 연결하세요.

---

## 3. 기본 변수

`src/styles/00-base.css` 기준:

```css
:root {
    --line-thickness: 1px;
    --line-gap: 11px;
    --unit: calc(var(--line-gap) - var(--line-thickness));

    --panel-width: 6vw;
    --stage-width: calc(100vw - var(--panel-width) + 1px);

    --top-row-1: 5.2rem;
    --top-row-2: calc(var(--top-row-1) + var(--unit));

    --transition: 700ms cubic-bezier(0.22, 1, 0.36, 1);
}
```

변수 의미:

| 변수 | 의미 |
| --- | --- |
| `--line-thickness` | 더블라인 내부 실제 선 두께 |
| `--line-gap` | 더블라인 전체 폭 또는 높이 |
| `--unit` | 격자 한 칸 보정값. 보통 `line-gap - line-thickness` |
| `--panel-width` | 좌측 사이드 패널 폭 |
| `--stage-width` | 사이드 패널을 제외한 실제 stage 폭 |
| `--top-row-1` | 첫 번째 상단 가로선 위치 |
| `--top-row-2` | 두 번째 상단 가로선 위치 |
| `--intersect` | 교차점 마커의 배경색 |

중요:

- stage 기준 좌표가 필요하면 `100%` 대신 `--stage-width`를 우선 사용합니다.
- 모바일 마커 정렬 문제는 대부분 `100%`가 부모 폭 기준으로 계산되어 발생합니다.

---

## 4. Preset 좌표

`src/lib/gridPresets.ts` 기준:

```ts
main: {
    line1: "calc(var(--stage-width) - (var(--unit) * 2))",
    line3: "calc(var(--stage-width) - var(--unit))",
    top2: "calc(100% - var(--line-gap))",
}

member: {
    line1: "calc(var(--stage-width) - (var(--unit) * 2))",
    line3: "calc(var(--stage-width) - var(--unit))",
    top2: "calc(var(--top-row-1) + var(--unit))",
}

workshop: {
    line1: "0px",
    line3: "calc(var(--stage-width) - var(--unit))",
    top2: "calc(var(--top-row-1) + var(--unit))",
}

diary: {
    line1: "0px",
    line3: "var(--unit)",
    top2: "calc(var(--top-row-1) + var(--unit))",
}
```

Preset별 의도:

| preset | 의도 |
| --- | --- |
| `main` | 우측 끝에 세로 격자를 두고, 두 번째 가로선은 하단으로 내려감 |
| `member` | 상단 두 줄 격자를 보이게 하고, 페이지가 아래에서 올라오는 느낌을 만듦 |
| `workshop` | 콘텐츠 영역을 좌측부터 우측 격자 전까지 사용 |
| `diary` | 캘린더 영역을 우측 격자 제외 공간 안에 맞춤 |
| `contact` | 패널/폼 중심. 일반 stage 셀보다 sidebar overlay의 영향이 큼 |

---

## 5. GridLines DOM 구조

`src/components/GridLines.tsx`는 격자선을 직접 렌더링합니다.

현재 생성되는 요소:

```tsx
<div className="h-line grid-row-1" />
<div className="h-line grid-row-2" />

<div className="v-line" style={{ left: "var(--line-x-1)" }} />
<div className="v-line" style={{ left: "var(--line-x-3)" }} />
<div className="v-line v-line-center" style={{ left: "var(--line-x-center)" }} />

<div className="top-v-1" />
<div className="top-v-3" />
<div className="top-v-center" />
```

의미:

| DOM | 역할 |
| --- | --- |
| `.grid-row-1` | 첫 번째 상단 가로 더블라인 |
| `.grid-row-2` | 두 번째 상단 가로 더블라인 |
| `.v-line` | 전체 높이 세로 더블라인 |
| `.v-line-center` | 중앙 세로 더블라인 |
| `.top-v-1`, `.top-v-3`, `.top-v-center` | 상단 두 가로선 사이에 있는 교차점 마커 생성용 세로 블록 |

`top-v-*`는 선처럼 보이지만 목적은 **두 가로선과 만나는 교차점 마커를 안정적으로 그리는 것**입니다.

---

## 6. 더블라인 생성 로직

더블라인은 실제 DOM 하나와 `::before`, `::after` 두 가상 요소로 만듭니다.

가로선:

```css
.h-line {
    height: var(--line-gap);
    background: var(--bg);
}

.h-line::before {
    top: 0;
}

.h-line::after {
    bottom: 0;
}
```

세로선:

```css
.v-line {
    width: var(--line-gap);
}

.v-line::before {
    left: 0;
}

.v-line::after {
    right: 0;
}
```

이 구조에서 `--line-gap`은 더블라인의 전체 폭/높이이고, `--line-thickness`는 실제 검은 선 두께입니다.

---

## 7. 교차점 마커 생성 로직

### 7.1 상단 grid 교차 마커

`top-v-*` 요소의 `::before`, `::after`가 마커입니다.

```css
.top-v-1,
.top-v-3,
.top-v-center {
    width: var(--line-gap);
    top: var(--top-row-1);
    height: calc(var(--top-row-2) - var(--top-row-1) + var(--line-gap));
}

.top-v-1::before,
.top-v-1::after {
    width: 100%;
    height: var(--line-gap);
    background: var(--intersect);
    border: var(--line-thickness) solid var(--line);
    box-sizing: border-box;
}

.top-v-1::before {
    top: 0;
}

.top-v-1::after {
    bottom: 0;
}
```

이 방식의 장점:

- 마커가 더블라인 폭(`--line-gap`)과 항상 같은 크기를 유지합니다.
- 가로선/세로선 border가 겹쳐 두꺼워지는 문제를 줄입니다.
- `box-sizing: border-box`로 마커 크기가 border 포함 기준이 됩니다.

### 7.2 모바일 메인 내부 divider 마커

모바일 main/member 내부에서 쓰는 `.mobile-main-divider`는 실제 grid line이 아니라 콘텐츠 내부에 삽입된 가로 구분선입니다.

위치:

- CSS: `src/styles/11-member-contact-sidebar.css`
- 모바일 노출 보정: `src/styles/12-mobile-scroll-layout.css`

현재 구조:

```css
.mobile-main-divider {
    --mobile-divider-line-x-1: calc(100% - (var(--unit) * 2));
    --mobile-divider-line-x-3: calc(100% - var(--unit));

    height: var(--line-gap);
    border-top: var(--line-thickness) solid var(--line);
    border-bottom: var(--line-thickness) solid var(--line);
}

.mobile-main-divider::before,
.mobile-main-divider::after {
    width: var(--line-gap);
    height: var(--line-gap);
    background: var(--intersect);
    border: var(--line-thickness) solid var(--line);
    box-sizing: border-box;
    top: calc(-1 * var(--line-thickness));
}

.mobile-main-divider::before {
    left: var(--mobile-divider-line-x-1);
}

.mobile-main-divider::after {
    left: var(--mobile-divider-line-x-3);
}
```

중요:

- `top: calc(-1 * var(--line-thickness))`는 마커가 divider 내부 border box 기준으로 1px 아래 밀리는 현상을 보정합니다.
- 모바일 divider는 부모 콘텐츠 폭 기준의 `100%`를 사용합니다. stage 전체 좌표와 맞춰야 할 때는 `--stage-width` 기반으로 다시 계산해야 합니다.
- 마커 크기는 `width/height: var(--line-gap)`를 유지해야 다른 grid 마커와 시각 시스템이 같습니다.

### 7.3 Contact form diamond 마커

Contact form의 입력 줄 구분 마커는 grid 마커와 다른 시스템입니다.

위치:

- CSS: `src/styles/11-member-contact-sidebar.css`

현재 구조:

```css
.contact-sidebar-content .form-classic-row::before,
.contact-sidebar-content .form-classic-row::after {
    width: 10px;
    height: 10px;
    background-color: var(--intersect);
    border: var(--line-thickness) solid #000;
    transform: rotate(45deg);
    bottom: -5px;
}
```

모바일에서는 8px로 줄입니다.

이 마커는 실제 grid 교차점이 아니라 form row divider 장식이므로, grid 좌표와 직접 맞추려고 하지 않는 것이 좋습니다.

### 7.4 Calendar header diamond 마커

Calendar 요일 header 사이의 마름모는 calendar 내부 grid marker입니다.

위치:

- CSS: `src/styles/12-mobile-scroll-layout.css`

모바일 기준:

```css
.grid-header-cell:not(:last-child)::after {
    width: var(--line-gap);
    height: var(--line-gap);
    right: calc(-1 * var(--line-gap) / 2);
    bottom: calc(-1 * var(--line-gap) / 2);
    box-sizing: border-box;
}
```

이 마커는 캘린더 내부 셀 경계 기준이므로 stage 전체 grid 좌표와 독립적으로 관리합니다.

---

## 8. Cell 배치 규칙

모든 페이지 영역은 `.cell`을 기반으로 absolute 배치됩니다.

공통:

```css
.cell {
    position: absolute;
    overflow: hidden;
    transition: all var(--transition);
    opacity: 0;
    pointer-events: none;
}

.cell.active {
    opacity: 1;
    pointer-events: auto;
}
```

대표 셀:

| 셀 | 데스크톱 기본 위치 |
| --- | --- |
| `.cell-main` | `top: var(--top-row-1)` |
| `.cell-member` | `top: var(--top-row-2)`, `height: calc(100% - var(--top-row-2))` |
| `.cell-workshop` | `top: calc(var(--top-row-1) + var(--line-gap))`, `left: var(--line-x-1)`, `width: calc(var(--line-x-3) - var(--line-x-1))` |
| `.cell-diary` | `top: calc(var(--top-row-1) + var(--line-gap))`, `left: var(--line-x-3)` |

Desktop에서 “격자 한 면에 페이지가 붙어서 끌려오는 느낌”은 `--top-row-2`, `--line-x-*`가 바뀌고 cell도 같은 변수에 묶여 있기 때문에 생깁니다.

---

## 9. 모바일 정책

모바일 정책은 마지막 import인 `src/styles/12-mobile-scroll-layout.css`가 우선합니다.

기본 방향:

```css
@media (max-width: 768px) {
    .cell-main,
    .cell-member,
    .cell-workshop,
    .cell-diary {
        top: var(--top-row-1) !important;
        left: 0 !important;
        right: 0 !important;
        height: calc(100dvh - var(--top-row-1)) !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior: none !important;
        touch-action: pan-y;
    }
}
```

의도:

- 모바일에서는 콘텐츠 셀을 한 화면짜리 세로 스크롤 영역으로 고정합니다.
- 데스크톱처럼 실제 좌표를 크게 움직이면 모바일 주소창/터치/overscroll과 충돌하기 쉽습니다.
- 그래서 모바일 page carry 효과는 layout 좌표가 아니라 `transform` animation으로 재현합니다.

### 9.1 Mobile member 전환

member에서는 두 번째 가로선이 보여야 합니다.

```css
.preset-workshop .grid-row-2,
.preset-diary .grid-row-2 {
    opacity: 0 !important;
    transition: none !important;
}

.preset-member .grid-row-2 {
    opacity: 1 !important;
    transition: top var(--transition), opacity 120ms ease !important;
}
```

member 페이지가 grid line에 붙어 올라오는 느낌은 아래 animation으로 만듭니다.

```css
.preset-member .cell-member.active {
    --mobile-member-carry-distance: calc(100dvh - var(--top-row-1) - var(--line-gap));

    animation: mobile-member-page-carry var(--transition) both;
    will-change: transform, opacity;
}

@keyframes mobile-member-page-carry {
    from {
        opacity: 0.98;
        transform: translate3d(0, var(--mobile-member-carry-distance), 0);
    }

    to {
        opacity: 1;
        transform: translate3d(0, 0, 0);
    }
}
```

중요:

- 모바일에서는 `top` 자체를 애니메이션하지 말고 `transform`을 사용합니다.
- grid line은 `top` transition, 페이지는 `transform` animation으로 같은 체감을 만듭니다.
- `prefers-reduced-motion: reduce`에서는 animation을 꺼야 합니다.

### 9.2 Mobile workshop/diary

workshop/diary에서는 두 번째 가로선이 숨겨지는 것이 현재 의도입니다.

```css
.preset-workshop .grid-row-2,
.preset-diary .grid-row-2 {
    opacity: 0 !important;
    transition: none !important;
}
```

member 수정 시 이 그룹에 `.preset-member`를 다시 넣지 않도록 주의하세요.

### 9.3 Mobile diary drag lock

calendar/diary는 내부 폼이 좌우상하로 끌리는 문제를 막기 위해 별도 잠금이 있습니다.

```css
.preset-diary .cell-diary {
    overflow: hidden !important;
    touch-action: none !important;
}

.preset-diary .diary-wrapper,
.preset-diary .calendar-container {
    overflow: hidden !important;
    overscroll-behavior: none !important;
    touch-action: none !important;
}
```

### 9.4 Mobile contact drag lock

contact form은 sidebar overlay이므로 `.left-panel.contact-mode` 기준으로 잠급니다.

```css
.left-panel.contact-mode,
.left-panel.contact-mode.expanded {
    width: 100dvw !important;
    height: 100dvh !important;
    overflow: hidden !important;
    overscroll-behavior: none !important;
    touch-action: none !important;
}
```

입력 필드는 터치가 되어야 하므로 `form-input`, `textarea`, submit button은 `touch-action: manipulation`을 유지합니다.

---

## 10. Z-index 정책

대략적인 계층:

| 요소 | z-index |
| --- | --- |
| `.h-line`, `.v-line` | `11000` |
| `.top-v-*` 교차 마커 | `11001` |
| active 일반 cell | `10` |
| `.cell-member.active` | `20` |
| header | `13000` 근처 |
| sidebar/contact panel | `12005` 근처 |
| auth modal | `15000` 근처 |

주의:

- grid line은 cell보다 위에 있어야 선이 콘텐츠에 묻히지 않습니다.
- sidebar/contact/auth overlay는 grid보다 위에 있어야 합니다.
- chatbot/info 같은 floating UI와 overlay 간 충돌은 별도 z-index 확인이 필요합니다.

---

## 11. 수정 가이드

### 상단 두 번째 가로선이 안 보일 때

확인 순서:

1. `.grid-row-2` computed style의 `opacity`
2. `.grid-row-2` computed style의 `top`
3. 모바일이면 `12-mobile-scroll-layout.css`에서 preset별 숨김 규칙 확인
4. 콘텐츠 cell이 선 위를 덮는지 `z-index` 확인

member 모바일에서는 아래 상태가 정상입니다.

```text
.preset-member .grid-row-2 opacity: 1
.preset-member .grid-row-2 transition-property: top, opacity
```

### 마커가 선과 1px 어긋날 때

확인 순서:

1. 마커의 `box-sizing: border-box`
2. 마커의 `width`와 `height`가 `var(--line-gap)`인지
3. `top` 또는 `bottom`이 border 기준으로 1px 밀리는지
4. 부모가 `100%` 기준인지 `--stage-width` 기준인지

모바일 divider에서 아래 보정은 의도된 값입니다.

```css
top: calc(-1 * var(--line-thickness));
```

### 모바일 마커가 stage grid와 안 맞을 때

대부분 좌표 기준이 다릅니다.

- stage 전체 기준: `--stage-width`
- 콘텐츠 내부 기준: `100%`
- line gap 보정: `--unit`

stage 기준으로 맞춰야 하면 preset 좌표처럼 `calc(var(--stage-width) - ...)`를 사용하세요.

### 페이지 전환이 깜빡일 때

확인 순서:

1. active cell이 `opacity`만 바뀌고 있는지
2. grid line과 page cell이 같은 좌표 변수에 묶여 있는지
3. 모바일이면 `transform` animation이 같이 적용되는지
4. `.is-booting` 클래스 때문에 animation이 차단되는 초기 렌더 상태인지

---

## 12. 검증 체크리스트

수정 후 최소 검증:

```bash
npm run lint
npm run build
```

시각 smoke:

1. Desktop
   - `/`
   - `?preset=member`
   - `?preset=workshop`
   - `?preset=diary`

2. Mobile 375x667 또는 390x844
   - main -> member 전환
   - member 상단 두 줄 격자 확인
   - member page가 grid line에 붙어 올라오는지 확인
   - workshop/diary에서 두 번째 가로선이 의도대로 숨겨지는지 확인
   - calendar가 우측 격자 영역을 침범하지 않는지 확인
   - contact/calendar가 좌우상하로 드래그되지 않는지 확인

Computed style로 확인할 값:

```text
.grid-row-2
  opacity
  top
  transition-property

.cell-member.active
  transform
  animation-name
  top

.mobile-main-divider::before/::after
  width
  height
  top
  left
```

---

## 13. 변경 원칙

1. 좌표 변경은 `gridPresets.ts`에서 시작합니다.
2. 격자선 DOM을 늘릴 때는 `GridLines.tsx`와 `04-grid-cells.css`를 함께 수정합니다.
3. 마커는 크기를 `--line-gap`에 맞춥니다.
4. stage 기준 좌표는 `--stage-width`를 씁니다.
5. 모바일 전환은 layout 좌표보다 `transform`을 우선합니다.
6. 모바일 예외는 `12-mobile-scroll-layout.css`에 모읍니다.
7. `workshop/diary`의 `.grid-row-2` 숨김 정책과 `member`의 `.grid-row-2` 노출 정책을 섞지 않습니다.
8. overlay, chatbot, info button은 grid system과 z-index 충돌 가능성이 있으므로 별도 확인합니다.
