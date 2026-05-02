# 📋 방명록(Guestbook) 네트워크 모델 업데이트 기록 (2025.04.15)

본 문서는 오늘 수행된 방명록 UI 및 물리 엔진 개편 사항을 상세히 기록합니다. 나중에 특정 로직을 이전으로 되돌리고 싶을 때 참고하시기 바랍니다.

---

## 1. 함수 참조 오류 및 데이터 동기화 해결
*   **파일:** `src/app/page.tsx`
*   **기존 문제:** `handleSendMessage`에서 존재하지 않는 `fetchGuestMessages()`를 호출하여 방명록 전송 후 목록이 갱신되지 않음.
*   **수정 사항 (Line 108~127 부근):**
    *   `useEffect` 내부에 고립되어 있던 `fetchMessages`를 `fetchGuestMessages`로 이름을 변경하고 컴포넌트 레벨로 추출.
    *   이제 전송 성공 시 및 실시간 업데이트 시 공통으로 호출 가능.

---

## 2. 물리 엔진 성능 최적화 (Layout Thrashing 해결)
*   **파일:** `src/app/page.tsx`
*   **수정 사항 (Line 279~370 부근):**
    *   **DPR 보정:** `window.devicePixelRatio`를 활용하여 레티나 디스플레이에서 실(Line)이 깨지지 않도록 캔버스 해상도 보정 적용.
    *   **연산 최적화:** 매 프레임마다 호출되던 `getBoundingClientRect()`를 루프 외부에서 한 번만 캐싱하도록 변경. (GPU 부하 대폭 감소)
    *   **앵커 반발 시스템:** 노드가 겹치지 않도록 앵커(기준점)끼리 서로 밀어내는 물리 공식 도입.

---

## 3. 비율제(Percentile) 노드 크기 조절 시스템
*   **파일:** `src/app/page.tsx`
*   **수정 사항 (Line 380~395 부근):**
    *   **기존:** 시간에 따라 크기가 줄어들었으나, 메시지가 적을 때 화면이 텅 비어 보임.
    *   **신규:** 전체 노드를 시간순으로 정렬하여 상대적 비율로 크기 결정.
        *   **상위 10% (최신):** 140px
        *   **중간 60%:** 100px
        *   **하위 30% (오래된):** 20px (제목 숨김 처리)
    *   **코드 로직:** `[...nodes].sort((a, b) => b.timestamp - a.timestamp)`를 통해 순위 계산.

---

## 4. 호버 상세 카드 레이아웃 개편
*   **파일:** `src/app/globals.css`, `src/app/page.tsx`
*   **수정 사항 (globals.css Line 543~580 부근):**
    *   **구조:** `display: flex; flex-direction: column;`을 적용하여 제목과 내용을 수직으로 배치.
    *   **높이 버그 수정:** 호버 시 카드가 늘어나지 않던 현상을 `height: auto !important; min-height: 140px;`로 해결.
    *   **제목 멀티라인:** 긴 제목이 3줄까지 보이도록 `-webkit-line-clamp: 3` 적용.
    *   **내용 스크롤:** 내용이 너무 긴 경우 카드 밖으로 나가지 않고 내부에서 스크롤(`overflow-y: auto`)되도록 수정.

---

## 5. Next.js Hydration 에러 해결
*   **파일:** `src/app/page.tsx`
*   **기존 문제:** `useState(new Date())` 초기값 불일치로 인해 서버/클라이언트 렌더링 결과가 달라 에러 발생.
*   **수정 사항 (Line 75~80 부근):**
    *   초기값을 고정 날짜(`2025, 3, 1`)로 설정하고, `useEffect` 마운트 후 `setCurrentMonth(new Date())`를 통해 실제 현재 시간으로 업데이트.
    *   `mounted` 상태 변수를 추가하여 클라이언트 전용 렌더링 안전성 확보.

---

## 🛠 로직을 되돌리고 싶을 때 (Rollback Tips)
1.  **도형 크기를 다시 시간제로 바꾸려면:** `page.tsx` 380번줄의 `rankIndex` 관련 로직을 삭제하고 `now - n.timestamp` 기반의 조건문으로 변경하세요.
2.  **호버 카드를 이전의 단순 팝업으로 바꾸려면:** `globals.css`의 `.network-node.guest-node:hover` 섹션에서 `position: static`을 다시 `position: absolute`로 바꾸면 제목과 내용이 겹치게 됩니다.
3.  **자세한 변경 이력은:** 에디터의 `Local History`를 활용하거나 본 문서를 참조하여 해당 줄 번호의 코드를 대조해 보세요.
