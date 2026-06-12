# IYOWEBSITE Workshop Registration, Auth, & Payment Contract

## 1. 범위 (Scope)
이 문서는 IYOHOUSE 시스템의 워크숍 신청(Workshop Registration), 사용자 인증(Auth), 그리고 결제(Payment) 통합 구현에 대한 강제 계약(Contract) 문서입니다.

## 2. 진실의 원천 (Source of Truth)
- **단일 레포 경로**: `/Users/eojun/Desktop/IYOWEBSITE-TOTAL/iyohouse-total`
- **기준 브랜치**: `main`
- **문서 우선 원칙**: 코드 구현체와 본 계약 문서의 내용이 충돌할 경우, **반드시 본 계약 문서의 내용을 우선**으로 적용합니다. 본 문서는 구현 가이드가 아니라 모든 에이전트(DB, Logic, Payment)가 준수해야 할 유일한 강제 기준입니다.

## 3. 데이터 계약 (Data Contract)
- **테이블명**: `workshop_registrations_v2` (구형 테이블 사용 금지)
- **상태 컬럼명**: `status`
- **상태값 Enum (`registration_status`)**: 
  - `pending` (신청 직후 결제 대기)
  - `confirmed` (결제 완료 및 승인)
  - `cancelled` (결제 실패 또는 유저 취소)
  - `expired` (결제 기한 초과로 인한 자동 만료)
- **Unique 제약조건**: `idx_unique_active_registration` (`user_id`, `workshop_id`) 필드 조합으로 `status IN ('pending', 'confirmed')`인 경우 중복 신청을 방지합니다.
- **Snapshot 필드**: 신청 당시의 유저 정보를 보존하기 위해 `snapshot_name`, `snapshot_phone`, `snapshot_email` 필드를 필수로 기록해야 합니다.
- **신청 식별 필드**: `workshop_registrations_v2`에는 결제 연결을 위한 `order_id` 필드를 포함해야 합니다. `order_id`는 테이블 내에서 UNIQUE 여야 합니다.
- **Payments 테이블 구조**: 
  - 테이블명: `payments`
  - 컬럼: `id`, `registration_id` (FK), `amount`, `payment_method`, `payment_key` (UNIQUE), `order_id` (UNIQUE), `status`, `created_at`
  - `payments.registration_id`는 `workshop_registrations_v2.id`를 참조해야 합니다.
  - `payments.amount`는 승인 시점의 실제 결제 금액을 저장해야 합니다.

## 4. 인증 계약 (Auth Contract)
- **라이브러리**: 인증 처리는 반드시 `@supabase/ssr`을 사용합니다.
- **인증 콜백**: OAuth 로그인 후 `/auth/callback` 라우트를 통해 세션을 교환하고 프로필을 검증합니다.
- **온보딩**: 추가 프로필 정보(이름, 전화번호 등)가 없는 사용자는 `/onboarding`으로 리다이렉트되어야 합니다.
- **필수 조건**: **프로필(full_name, phone)이 완성되기 전에는 워크숍 신청을 절대 금지**합니다.

## 5. 신청 계약 (Registration Contract)
- **[금지]** 클라이언트(브라우저)에서 `workshop_registrations_v2` 테이블에 직접 `insert` 쿼리를 수행하는 것을 엄격히 금지합니다.
- **RPC 사용 강제**: 등록 요청은 오직 `create_pending_registration(p_workshop_id)` RPC 호출만을 통해 이루어져야 합니다. (`p_user_id` 파라미터는 사용하지 않으며 서버 측에서 `auth.uid()`를 통해 처리합니다)
- **초기 상태**: 생성 시 상태는 항상 `pending`으로 설정됩니다.
- **필수 검증**: `create_pending_registration`은 `auth.uid()`가 존재하지 않으면 실패해야 하며, `full_name`과 `phone`이 비어 있으면 실패해야 합니다.
- **정원/중복 검사 책임**: 워크숍 수용 인원 초과 및 중복 신청 검사는 전적으로 DB RPC(`create_pending_registration`) 내부에서 안전하게 검증할 책임이 있습니다. 클라이언트 측 UI 검사에 의존하지 마십시오.
- **결제 연결 값**: `create_pending_registration`은 반환값으로 `JSONB` 객체를 반환하며, 반드시 `registration_id`, `order_id`, `amount` 세 가지 값을 포함해야 합니다. 클라이언트는 이 반환값만으로 결제 요청을 시작할 수 있어야 합니다.

## 6. 결제 계약 (Payment Contract)
- **시크릿 키 관리**: 결제 API 호출 시 하드코딩된 시크릿 키는 절대 사용 불가하며, 반드시 서버 환경변수 `process.env.IYO_NICEPAY_SECRET_KEY`를 통해서만 접근합니다.
- **결제 시작 위치**: 브라우저는 `create_pending_registration` 결과의 `registration_id`를 `POST /api/payment/checkout`으로 보내고, 서버가 반환한 NICEPAY payload로 결제창을 열어야 합니다.
- **리다이렉트 URL**: NICEPAY `returnUrl`은 서버 라우트 `/api/payment/confirm`이어야 하며, 결제 성공 화면은 서버 승인 이후에만 표시되어야 합니다.
- **승인 로직 위치**: 결제 승인(Confirm) 로직은 반드시 서버 사이드 라우트(예: `/api/payment/confirm`) 내부에서만 실행되어야 합니다.
- **승인 전 검증 강제**: `/api/payment/confirm`은 결제 승인 전에 아래를 반드시 검증해야 합니다.
  - NICEPAY 인증 응답의 `authResultCode`가 성공이어야 합니다.
  - 신청 상태가 `pending`이어야 합니다.
  - NICEPAY `orderId`가 신청 레코드의 `order_id`와 일치해야 합니다.
  - NICEPAY `amount`가 서버 기준 금액과 일치해야 합니다.
  - `authToken + clientId + amount + IYO_NICEPAY_SECRET_KEY` 서명이 일치해야 합니다.
  - NICEPAY 승인 API 결과의 `orderId`, `amount`, 선택적 결과 서명이 내부 신청 정보와 일치해야 합니다.
- **상태 업데이트 강제**: 결제 완료 후 테이블 상태 변경은 테이블 직접 `update` 연산을 절대 금지하며, 오직 `confirm_payment_registration(p_registration_id UUID, p_payment_key TEXT, p_order_id TEXT, p_amount INTEGER)` RPC를 통해서만 수행해야 합니다. 이 RPC는 서버 라우트에서 service role client로만 호출해야 합니다. `p_payment_key`에는 NICEPAY `tid`를 넣습니다.
- **실패 처리 강제**: 결제 실패 또는 취소 후 상태 변경이 필요하면 반드시 서버 라우트 또는 RPC를 통해 `cancelled`로 전환해야 합니다. 클라이언트에서 직접 테이블을 갱신해서는 안 됩니다.
- **[금지]** 클라이언트 사이드에서 직접 결제 상태를 업데이트하는 API 호출을 절대 금지합니다.

## 7. RLS 및 권한 계약 (RLS / Permission Contract)
- **조회/수정 권한**: 
  - 일반 사용자: 자신의 프로필, 신청 내역(`user_id = auth.uid()`), 본인의 결제 내역만 `SELECT` 가능. 
  - 관리자/워크숍 매니저: 자신에게 할당된 워크숍의 모든 신청 내역 조회 가능.
- **RPC 실행 권한**: `create_pending_registration`, `confirm_payment_registration` 로직은 `SECURITY DEFINER`로 설정되어 프로시저 작성자 권한 하에 안전하게 내부 트랜잭션으로 동작해야 합니다.
- **RPC 권한 제한**: 모든 RPC는 기본 `PUBLIC` 실행 권한을 제거해야 합니다. 필요한 역할에 대해서만 `GRANT EXECUTE`를 명시해야 합니다.
- **승인 RPC 제한**: `confirm_payment_registration`은 `service_role` 전용으로 실행을 제한해야 합니다. `authenticated` 역할에는 이 RPC 실행 권한을 부여하지 않습니다. 사용자 소유권 검증은 `/api/payment/checkout` 서버 라우트에서 수행하고, `/api/payment/confirm`은 NICEPAY 서버 인증과 내부 주문 검증을 수행합니다.
- **Service Role 사용**: 웹훅이나 스케줄러 등 관리자 권한이 필요한 경우에 한하여 `SUPABASE_SERVICE_ROLE_KEY`를 사용하며, 일반 API 라우트에서는 사용을 지양합니다.

## 8. 🚨 절대 금지 항목 (Banned Practices)
다음 용어, 변수명, 패턴은 코드베이스 내 어디에서도 존재해서는 안 됩니다.
1. `workshop_registrations` (구형 테이블명 사용 불가)
2. `payment_status` (구형 상태 컬럼명 사용 불가)
3. 상태값으로의 `completed` 사용 (워크숍 등록 상태는 반드시 `confirmed` 사용)
4. 평문 PG 시크릿 키의 코드 내 하드코딩
5. Client-side direct registration `insert`
6. Payment confirm 후 수행되는 direct table `update`
7. 클라이언트에서 수행되는 결제 실패 후 direct table `update`
8. `create_pending_registration` 외의 신청 생성 RPC 이름 추가
9. `confirm_payment_registration` 외의 결제 확정 RPC 이름 추가

## 9. 통합 검증 기준 (Validation Standards)
각 에이전트는 담당 작업 완료 시 아래의 기준을 모두 만족해야 합니다:
1. **금지어 검사**: `rg "workshop_registrations[^_]|payment_status|'completed'|test_sk_|TOSS_|tosspayments|api.tosspayments.com" /Users/eojun/Desktop/IYOWEBSITE-TOTAL/iyohouse-total --glob '!**/docs/workshop-registration-contract.md' --glob '!**/docs/workshop-registration-logic-summary.md' --glob '!**/결제방식.md' --glob '!**/.env.example' --glob '!**/node_modules/**'` 명령어를 통해 프로젝트 내 금지어가 하나도 발견되지 않아야 함.
2. **Lint 검증**: 단일 레포 루트에서 `npm run lint` 실행 시 구문 및 타입 에러가 0건이어야 함.
3. **Build 검증**: 단일 레포 루트에서 `npm run build` 실행 시 성공해야 함.
4. **DB Migration**: `supabase/migrations/` 폴더 내의 SQL 파일이 구문 오류 없이 데이터베이스에 적용 가능해야 함.
5. **통합 일치성 검사**: `workshop_registrations_v2`, `status`, `create_pending_registration`, `confirm_payment_registration` 네 계약 요소가 DB migration, API route, 페이지 로직, 훅 로직에 일관되게 반영되어야 함.
