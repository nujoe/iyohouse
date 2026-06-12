# NICEPAY 결제 연동 인수 문서

이 PR은 IYO Wiki에서 검증한 NICEPAY 서버 승인 흐름을 이요하우스 워크숍 신청 시스템에 맞게 옮긴 준비 브랜치입니다. 총괄 관리자가 검토한 뒤 운영 키와 NICEPAY 계약 정보를 넣으면 워크숍 신청 결제창을 열 수 있도록 구성했습니다.

## 적용 범위

- Toss Payments SDK와 Toss 승인 API 의존성을 제거했습니다.
- 워크숍 신청 생성은 기존 Supabase RPC `create_pending_registration(p_workshop_id)`를 그대로 사용합니다.
- 결제 확정은 서버에서만 `confirm_payment_registration(...)` RPC를 호출합니다.
- 클라이언트는 결제 완료를 직접 확정하지 않고 NICEPAY 결제창을 여는 역할만 합니다.

## 환경 변수

운영/테스트 환경에 아래 값을 설정해야 합니다. 실제 키는 저장소에 커밋하지 않습니다.

```bash
IYO_NICEPAY_ENABLED=true
IYO_NICEPAY_MODE=test
IYO_NICEPAY_CLIENT_KEY=S1_...
IYO_NICEPAY_SECRET_KEY=...
IYO_NICEPAY_METHOD=card
IYO_NICEPAY_METHODS=card
IYO_NICEPAY_VBANK_VALID_HOURS=72
```

운영 전환 시 `IYO_NICEPAY_MODE=production`으로 바꾸고 NICEPAY 운영 client key/secret key를 넣습니다. 기본 결제창 스크립트는 `https://pay.nicepay.co.kr/v1/js/`이며, 테스트 client key는 해당 스크립트에서 sandbox로 라우팅됩니다.

## 결제 흐름

1. 사용자가 워크숍 상세 화면에서 신청합니다.
2. 클라이언트가 기존 `create_pending_registration` RPC로 `pending` 신청을 만듭니다.
3. 클라이언트가 `POST /api/payment/checkout`에 `registration_id`를 보냅니다.
4. 서버가 신청 소유자, 상태, 만료, 금액을 확인하고 NICEPAY payload와 script URL을 반환합니다.
5. 클라이언트가 NICEPAY 결제창을 엽니다.
6. NICEPAY가 `POST /api/payment/confirm`으로 서버 인증 결과를 보냅니다.
7. 서버가 `authToken + clientId + amount + secretKey` 서명을 검증합니다.
8. 서버가 NICEPAY 승인 API `/v1/payments/{tid}`를 호출합니다.
9. 승인 응답의 `orderId`, `amount`, 선택적 결과 서명을 다시 검증합니다.
10. 검증이 끝나면 `confirm_payment_registration` RPC로 `confirmed` 신청과 `payments` row를 만듭니다.
11. NICEPAY 승인 후 DB 확정이 실패하면 `/v1/payments/{tid}/cancel`로 보상 취소를 시도합니다.

## 라우트 계약

- `POST /api/payment/checkout`
  - 로그인 사용자만 호출합니다.
  - 입력: `registration_id`, 선택 `orderName`, `method`, `scheduleLabel`
  - 출력: `{ success, scriptUrl, payload }`

- `POST /api/payment/confirm`
  - NICEPAY returnUrl입니다.
  - form POST와 JSON을 모두 파싱합니다.
  - 성공 시 `/payment/success`로 redirect합니다.
  - 실패 시 `/payment/fail`로 redirect합니다.

- `POST /api/payment/webhook`
  - NICEPAY 사후 웹훅용입니다.
  - `tid + amount + ediDate + secretKey` 서명을 검증합니다.
  - `paid`는 같은 Supabase 확정 RPC로 처리합니다.
  - `cancelled`는 활성 신청을 `cancelled`로 전환합니다.
  - `expired`, `failed`는 아직 pending인 신청만 `cancelled`로 전환합니다.
  - NICEPAY 요구사항에 맞춰 성공 처리 시 `text/html` 본문 `"OK"`로 응답합니다.

- `/payment/fail`
  - 실패 안내 화면입니다.
  - URL 방문만으로 신청 상태를 바꾸지 않습니다.
  - 검증된 서버 승인/웹훅/만료 처리만 신청 상태를 변경해야 합니다.

## Supabase 계약

기존 계약을 유지합니다.

- 신청 테이블: `workshop_registrations_v2`
- 결제 기록 테이블: `payments`
- 신청 생성 RPC: `create_pending_registration(p_workshop_id)`
- 결제 확정 RPC: `confirm_payment_registration(p_registration_id, p_payment_key, p_order_id, p_amount)`

`p_payment_key`에는 NICEPAY `tid`를 넣습니다. 이 값은 `payments.payment_key`의 UNIQUE 계약과 잘 맞습니다.

## 운영 전 확인

- NICEPAY 테스트 키로 카드 결제 승인/실패/취소 흐름을 확인합니다.
- Vercel 또는 배포 환경에 `IYO_NICEPAY_*`와 Supabase service role key가 모두 설정되어 있는지 확인합니다.
- NICEPAY 관리자 콘솔에 returnUrl/webhook URL을 실제 배포 도메인으로 등록합니다.
- 운영 전 `IYO_NICEPAY_ENABLED=true`, `IYO_NICEPAY_MODE=production`, 운영 key 전환을 한 번에 확인합니다.
- `npm run lint`와 `npm run build`를 배포 환경과 같은 Node 버전에서 통과시킵니다.

## 이번 PR에서 다루지 않은 것

- 관리자 환불/부분취소 화면
- NICEPAY 취소 API 호출 UI
- 정기결제/빌링키
- 입금 계좌 수동 확인형 결제
