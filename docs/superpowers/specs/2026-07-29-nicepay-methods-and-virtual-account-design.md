# NICEPAY 간편결제 및 가상계좌 설계

## 목적

IYOHOUSE 워크숍 신청은 현재 NICEPAY 카드 결제만 사용한다. 카드와 간편결제는 NICEPAY 결제창에서 선택하게 하고, 가상계좌는 NICEPAY 가상계좌 발급 흐름으로 처리한다. 결제 대기 중인 신청은 자리만 임시로 보유하며, 실제 입금 확인 전에는 확정 신청자로 취급하지 않는다.

이 작업은 기존 카드 결제, Sanity 발행·동기화, 워크숍 상세 레이아웃, 관리자 확정 신청자 목록을 유지한다.

## 사용자 흐름

1. 로그인·프로필 완료 사용자가 워크숍 상세에서 `워크숍 신청하기`를 누른다.
2. IYOHOUSE의 작은 결제수단 모달이 열린다. 이 모달은 로그인 모달의 프레임·버튼 스타일을 재사용하며 아래 두 선택지만 둔다.
   - `카드·간편결제`
   - `가상계좌`
3. `카드·간편결제`를 선택하면 `AUTHNICE.requestPay({ method: "cardAndEasyPay" })`를 호출한다. NICEPAY 기본 UI에서 카드, 카카오페이, 네이버페이, 삼성페이를 선택한다.
4. `가상계좌`를 선택하면 `AUTHNICE.requestPay({ method: "vbank" })`를 호출한다. NICEPAY 기본 UI에서 가상계좌를 발급한다.
5. 카드·간편결제의 NICEPAY 승인 결과가 `paid`이면 신청을 즉시 `confirmed`로 바꾸고 기존 완료 페이지로 이동한다.
6. 가상계좌 발급 승인 결과가 `ready`이면 신청은 `pending`으로 유지하고, 발급 계좌·은행·예금주·금액·입금 마감 시각을 표시하는 입금 대기 페이지로 이동한다.
7. NICEPAY의 서명 검증된 `paid` 웹훅이 오면 그 가상계좌 신청만 `confirmed`로 바꾼다. 이때 기존 성공 완료 페이지를 보여줄 필요는 없으며, 새로고침한 입금 대기 페이지에는 결제 완료 상태가 표시된다.
8. 3시간 안에 입금되지 않아 NICEPAY가 `expired`를 통보하면 신청을 `cancelled`로 바꾸어 자리를 복구한다.

NICEPAY 결제창의 카드·간편결제/가상계좌 화면은 NICEPAY 기본 UI를 사용한다. IYOHOUSE는 여러 NICEPAY 결제수단을 한 화면에 직접 구현하지 않는다.

## NICEPAY 요청 및 환경 설정

현재 Server 승인 모델과 `AUTHNICE.requestPay()` SDK를 계속 사용한다. NICEPAY 공식 명세상 `method`는 요청마다 하나여야 한다.

| IYOHOUSE 선택 | NICEPAY method | 실제 결제 UI |
| --- | --- | --- |
| 카드·간편결제 | `cardAndEasyPay` | NICEPAY가 카드·간편결제를 표시 |
| 가상계좌 | `vbank` | NICEPAY가 은행 선택·계좌 발급을 표시 |

운영 환경에는 아래 허용 수단을 명시한다.

```text
IYO_NICEPAY_METHODS=cardAndEasyPay,vbank
IYO_NICEPAY_VBANK_VALID_HOURS=3
```

NICEPAY 관리자에서 카카오페이·네이버페이·삼성페이 및 가상계좌가 활성화되어 있어야 한다. 가상계좌 요청에는 `vbankHolder`와 3시간 유효기간을 포함한다. 실제 결제수단은 클라이언트의 선택값이 아니라 NICEPAY 승인 응답의 `payMethod`를 저장한다.

## 데이터 및 상태 전이

기존 `workshop_registrations_v2`와 `payments`를 확장한다. Sanity 스키마나 워크숍 발행 동기화에는 변경을 만들지 않는다.

`payments`에는 가상계좌 거래 추적에 필요한 최소 필드만 추가한다.

- `provider_status`: `ready`, `paid`, `expired`, `failed`, `cancelled`
- `issued_at`, `paid_at`, `expires_at`
- `vbank_code`, `vbank_name`, `vbank_number`, `vbank_holder`

계좌번호는 사용자 본인 입금 안내와 관리자 입금 대기 확인에만 사용한다. 일반 공개 API나 다른 사용자의 신청 이력에는 노출하지 않는다.

새 service-role 전용 RPC 두 개가 상태 전이를 잠근다.

- `record_virtual_account_issuance`: 동일 주문·금액·pending 상태를 검증한 뒤 `payments`에 `ready` 원장을 만들고 신청 `expires_at`을 NICEPAY 만료시각으로 맞춘다. 동일 TID 재호출은 멱등 처리한다.
- `confirm_virtual_account_deposit`: 동일 TID·주문·금액·가상계좌 결제수단·만료 전 상태를 검증한 뒤 `payments`를 `success/paid`로, 신청을 `confirmed`로 한 트랜잭션에서 바꾼다.

기존 `confirm_payment_registration`은 카드·간편결제 성공과 기존 웹훅 처리에 계속 사용한다. 가상계좌 `ready`에는 사용하지 않는다.

| 상황 | registration.status | payment 상태 | 자리 |
| --- | --- | --- | --- |
| 결제창 닫기·인증 실패 | `cancelled` | 생성하지 않음 또는 `failed` | 즉시 복구 |
| 카드·간편결제 승인 | `confirmed` | `success` / `paid` | 확정 |
| 가상계좌 발급 | `pending` | `ready` | 3시간 임시 보유 |
| 가상계좌 입금 웹훅 | `confirmed` | `success` / `paid` | 확정 |
| 가상계좌 만료·실패 웹훅 | `cancelled` | `expired` 또는 `failed` | 복구 |

## 서버와 웹훅 안전성

- `/api/payment/checkout`은 모달의 두 요청 값만 허용한다. 허용되지 않은 값은 카드로 조용히 대체하지 않고 오류로 거절한다.
- `/api/payment/confirm`은 NICEPAY 인증 서명, 주문번호, 금액을 검증한다. 승인 응답이 `vbank + ready`인 경우에만 가상계좌 발급 원장을 기록한다.
- 가상계좌 발급 뒤 브라우저에서 발생하는 `fnError`나 페이지 이탈은 신청을 취소하지 않는다. 유효한 TID가 만들어진 뒤에는 NICEPAY 웹훅의 `paid`/`expired` 결과가 최종 상태를 정한다.
- `/api/payment/webhook`은 서명, 주문번호, 금액 외에 가상계좌 원장의 TID와 `ready` 상태까지 일치할 때만 가상계좌 입금을 확정한다.
- 기존의 넓은 `cancelled` 웹훅 처리는 원결제 TID가 맞는 결제 원장에만 적용하도록 좁힌다. 지연되거나 중복된 웹훅이 다른 신청을 취소할 수 없게 한다.
- 가상계좌 만료 시점은 이미 사용 중인 `registration.expires_at`과 맞춘다. 일정별 정원 계산은 `confirmed`와 만료 전 `pending`만 세므로, 입금 대기 중에는 자리를 보유하고 만료 후에는 자동으로 신청 가능 상태가 된다.

## 화면 범위

- 워크숍 상세: 기존 신청 버튼과 레이아웃은 유지한다. 클릭 시만 작은 결제수단 모달을 추가한다.
- NICEPAY 결제창: 카드·간편결제 및 가상계좌 처리 화면은 NICEPAY 기본 UI를 그대로 사용한다.
- 입금 대기 페이지: 기존 결제 완료 모달 프레임을 재사용한다. 계좌 정보, 금액, 입금 기한, `입금 후 신청이 확정됩니다`를 표시한다. 본인 주문만 조회한다.
- 관리자: 확정 신청자 표는 바꾸지 않는다. 별도 `가상계좌 입금 대기` 영역에서 이름, 금액, 은행, 마스킹 계좌번호, 입금 기한을 확인한다. 만료·취소 신청자는 이 영역에서 제외한다.
- Sanity: 변경 없음.

## 검증 기준

자동 테스트와 수동 NICEPAY 테스트를 모두 수행한다.

1. `cardAndEasyPay` 요청이 카드·간편결제 모달에서만 생성되고, `vbank` 요청에는 예금주·3시간 유효기간이 포함된다.
2. 카드, 카카오페이, 네이버페이, 삼성페이 각각의 승인 응답이 기존과 같이 확정 신청과 결제수단 기록으로 이어진다.
3. 가상계좌 발급 응답 `ready`는 확정 처리하지 않고, 입금 대기 페이지와 관리자 대기 영역에만 보인다.
4. 서명된 가상계좌 `paid` 웹훅 한 번은 신청과 결제 원장을 한 번만 확정한다. 중복·역순 웹훅은 상태를 변경하지 않는다.
5. 가상계좌 `expired`/`failed` 웹훅은 pending 신청만 취소하고 해당 일정 자리를 복구한다.
6. 가상계좌 발급 뒤의 브라우저 취소·새로고침이 pending 신청을 잘못 취소하지 않는다.
7. 기존 카드 결제 성공·실패·취소, 관리자 결제 상세, Sanity 발행, 일정별 정원 테스트를 회귀 실행한다.

## 비범위

- 수동 계좌이체(`bank`)와 휴대폰 결제
- 부분 환불 및 환불 원장 리뉴얼
- Sanity 결제수단별 설정
- NICEPAY 결제창 자체의 디자인 수정
