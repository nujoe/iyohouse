# Dynamic Grid System Guide

이 가이드는 IYOHOUSE 프로젝트에서 사용된 **가변형 격자 시스템**의 핵심 로직을 설명합니다. 이 시스템은 일반적인 CSS Grid나 Flexbox와 달리, **CSS 변수를 좌표계처럼 사용**하여 요소들을 배치하고 애니메이션화합니다.

---

## 1. 핵심 개념: 선(Line) 기반 좌표계

화면에 보이지 않는(혹은 보이는) 기준선들을 CSS 변수로 정의합니다. 모든 요소는 이 변수들을 기준으로 위치(`top`, `left`, `width`, `height`)를 결정합니다.

### 핵심 CSS 변수 (예시)
```css
:root {
    /* 가로선 (Y축) */
    --top-row-1: 40px;
    --top-row-2: 47px; /* --top-row-1 + 두께 */

    /* 세로선 (X축) */
    --line-x-1: 20%;
    --line-x-2: 50%;
    --line-x-3: 80%;

    /* 애니메이션 속도 */
    --transition: 700ms cubic-bezier(0.22, 1, 0.36, 1);
}
```

---

## 2. HTML 구조

격자 프레임(선)과 실제 콘텐츠가 담기는 셀(Cell)을 분리하여 구성합니다.

```html
<div class="app-container">
    <!-- 1. 격자선 (Visual Lines) -->
    <div class="grid-frame">
        <div class="h-line row-1"></div>
        <div class="v-line col-1"></div>
        <!-- 필요한 만큼 선 추가 -->
    </div>

    <!-- 2. 콘텐츠 셀 (Content Cells) -->
    <main class="stage">
        <div class="cell cell-a">콘텐츠 A</div>
        <div class="cell cell-b">콘텐츠 B</div>
    </main>
</div>
```

---

## 3. 배치 로직 (CSS)

셀의 위치를 계산할 때 정의한 변수를 사용합니다. `calc()` 함수를 활용하면 선 사이의 간격을 유연하게 채울 수 있습니다.

### 셀 배치 예시
```css
.cell-a {
    position: absolute;
    top: var(--top-row-1);
    left: 0;
    /* 세로선 1번과 2번 사이를 꽉 채움 */
    width: var(--line-x-1);
    height: calc(var(--top-row-2) - var(--top-row-1));
    
    transition: all var(--transition);
}

.cell-b {
    position: absolute;
    top: var(--top-row-1);
    /* 세로선 1번에서 시작 */
    left: var(--line-x-1);
    /* 세로선 1번과 2번 사이의 너비만큼 가짐 */
    width: calc(var(--line-x-2) - var(--line-x-1));
    height: 100vh;

    transition: all var(--transition);
}
```

---

## 4. 동적 변화 (Preset 로직)

자바스크립트를 이용해 특정 상황(버튼 클릭, 페이지 전환 등)에서 CSS 변수값만 바꿔주면, 모든 격자와 셀이 `transition`에 의해 부드럽게 재배치됩니다.

### 로직 흐름
1.  **State 정의**: 현재 어떤 레이아웃 모드인지 상태 저장 (예: `main`, `sub`, `full`).
2.  **값 업데이트**: 상태에 따라 `--line-x-1` 등의 변수값을 변경.
3.  **결과**: CSS의 `transition`이 적용되어 모든 요소가 동시에 유기적으로 움직임.

---

## 5. 디자인 팁: 더블 라인 (Double Line)

이 프로젝트 특유의 "설계도" 느낌을 내려면 격자선을 두 줄로 만드는 것이 좋습니다.

```css
.h-line::before,
.h-line::after {
    content: "";
    position: absolute;
    background: black;
    width: 100%;
    height: 1px; /* 선 두께 */
}

.h-line::before { top: 0; }
.h-line::after { bottom: 0; }
```

이 방식을 사용하면 격자가 교차하는 지점에 작은 사각형 공간이 생기며, 훨씬 정교한 느낌을 줍니다.
