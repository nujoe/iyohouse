# IYOHOUSE Auth & Profile Flow Plan

## 목적
카카오/구글 OAuth 인증 직후 사용자를 곧바로 "회원"으로 취급하지 않고, 필수 정보 입력 모달을 통해 앱 기준 회원가입을 완료시키는 흐름을 정리한다.

필수 정보 기준은 다음 3개로 둔다.

- 이름: `profiles.full_name`
- 전화번호: `profiles.phone`
- 이메일: `profiles.email` 또는 `auth.users.email`

`bio`는 선택 정보 또는 "내 정보" 확장 항목으로 분리한다.

## 현재 코드 상태
현재 인증 관련 핵심 파일은 다음과 같다.

- `src/hooks/useAuth.ts`
  - Supabase session을 읽고 `profiles` 테이블에서 `email`, `full_name`, `phone`, `is_super_admin`, `bio`를 가져온다.
  - `isProfileComplete`를 `full_name`, `phone`, `email` 기준으로 계산한다.
  - Google/Kakao OAuth 함수가 정의되어 있다.
  - `updateProfile`은 `complete_profile` RPC를 통해 `full_name`, `phone`, 선택 `bio`만 저장한다.

- `src/app/page.tsx`
  - 로그인 모달 UI가 직접 포함되어 있다.
  - 로그인 후 프로필이 미완성이면 모달을 자동으로 연다.
  - 프로필 완성 폼은 `full_name`, `phone`을 필수로 요구하고 `bio`는 선택 입력으로 둔다.

- `src/app/auth/callback/route.ts`
  - OAuth code를 session으로 교환한다.
  - 프로필 미완성 사용자를 `/onboarding`으로 강제 리다이렉트하지 않고 메인 모달 흐름으로 돌려보낸다.

- `src/app/onboarding/page.tsx`
  - 별도 온보딩 페이지가 존재한다.
  - 여기서는 `full_name`, `phone`만 요구한다.
  - 저장은 `complete_profile` RPC를 통해 처리한다.

- `supabase/migrations/20260514000000_harden_profile_completion.sql`
  - `profiles.completed_at` 컬럼을 추가한다.
  - `complete_profile(full_name, phone, bio)` RPC를 추가한다.
  - 일반 클라이언트의 `profiles` 직접 insert/update 권한과 관련 RLS policy를 제거한다.

- `supabase/migrations/20260502000000_initial_schema.sql`
  - `auth.users` 생성 시 `profiles` row를 자동 생성한다.
  - `profiles.email`은 OAuth 이메일로 저장된다.
  - 워크숍 신청 RPC는 `full_name`, `phone`을 필수로 검증한다.

## 현재 모호한 점
1. 앱 기준 필수 정보가 파일마다 다르다.
   - 현재 앱 기준은 `full_name`, `phone`, `email`로 통일했다.
   - 워크숍 RPC는 아직 `full_name`, `phone`만 검증한다.
   - 이메일 누락까지 DB에서 막으려면 워크숍 RPC에 email 검증을 추가할 수 있다.

2. OAuth 직후 실제 DB에는 `profiles` row가 생긴다.
   - 따라서 엄밀히 말하면 Supabase auth 계정과 profile row는 즉시 생성된다.
   - 다만 앱 UX에서는 필수 정보가 완성되기 전까지 "가입 완료"가 아닌 `profile_incomplete` 상태로 취급하면 된다.

3. 모달 방식과 `/onboarding` 페이지 방식이 동시에 존재한다.
   - 현재 주 플로우는 메인 모달이다.
   - `/onboarding`은 fallback 페이지로 남아 있다.

4. 로그인 UI가 로그인 상태를 반영하지 않는다.
   - 사이드바에는 항상 `로그인`, `회원가입` 버튼이 보인다.
   - 로그인 완료 후 `로그아웃`, `내 정보` 또는 사용자 이름 버튼으로 바뀌는 로직이 필요하다.

5. `src/components/LoginModal.tsx`와 `page.tsx` 내부 로그인 모달이 중복된다.
   - 현재 메인 화면은 `page.tsx` 내부 모달을 사용한다.
   - 컴포넌트 파일은 별도로 있지만 메인 플로우와 분리되어 있다.

## 권장 상태 모델
앱에서 인증 상태를 다음 4단계로 명확히 나눈다.

```text
guest
  - Supabase session 없음
  - 로그인/회원가입 버튼 노출

oauth_authenticated_profile_incomplete
  - Supabase session 있음
  - profiles row 있음
  - email은 있음
  - full_name 또는 phone이 없음
  - 가입 완료 모달을 강제로 노출
  - 워크숍 신청 불가

member
  - Supabase session 있음
  - full_name, phone, email이 모두 있음
  - 로그인 버튼 대신 내 정보/로그아웃 노출
  - 워크숍 신청 가능

admin_or_manager
  - member 조건 충족
  - is_super_admin 또는 manager 권한 있음
  - 추후 관리자 UI 노출 가능
```

## 구현 방향

### 1. 필수 정보 기준 통일
`src/hooks/useAuth.ts`에 프로필 완성 기준을 한 곳으로 모은다.

현재:

```ts
Boolean(profile?.full_name && profile?.phone && profile?.bio)
```

권장:

```ts
Boolean(profile?.full_name && profile?.phone && (profile?.email || user.email))
```

추가로 `bio`는 `Profile` 타입에는 남기되 `isProfileComplete` 조건에서는 제외한다.

### 2. 프로필 업데이트 범위 정리
`updateProfile`이 이름/전화번호 중심으로 동작하도록 정리한다.

권장 입력:

```ts
{
  full_name: string;
  phone: string;
  email?: string;
}
```

`email`은 보통 OAuth에서 온 `user.email`을 사용하므로 사용자가 직접 바꾸는 입력으로 두지 않는다. 다만 `profiles.email`이 비어 있는 경우 저장 시 함께 채운다.

### 3. OAuth callback 이후 이동 방식 결정
메인 경험을 모달 중심으로 유지하려면 `/auth/callback`은 `/onboarding` 대신 `/`로 돌려보내고, `page.tsx`의 자동 모달 오픈이 가입 완료 폼을 띄우게 한다.

권장:

- OAuth 성공 후 항상 `next` 또는 `/`로 redirect
- 메인 페이지에서 `user && !isProfileComplete`이면 가입 완료 모달 자동 표시
- `/onboarding` 페이지는 제거하지 말고 fallback 또는 직접 링크용으로 남겨둘 수 있음

주의:
`/onboarding`을 계속 쓸 경우 모달 플로우와 UX가 갈라진다. 하나를 주 플로우로 정해야 한다.

### 4. 로그인 모달 역할 분리
`page.tsx` 안의 모달은 현재 세 역할을 동시에 한다.

- 비로그인 OAuth 시작
- 프로필 미완성 회원가입 완료
- 로그인 완료 후 프로필 확인/로그아웃

권장 구조:

- `AuthModal`
  - `guest`: 카카오/구글/이메일 로그인 선택
  - `profile_incomplete`: 이름/전화번호 입력
  - `member`: 내 정보 요약, 로그아웃, 내 정보 수정 진입

당장 큰 리팩토링이 부담되면 `page.tsx` 내부 구조를 유지하되, 조건문과 상태 이름만 먼저 정리한다.

### 5. 사이드바 버튼 상태 반영
현재 사이드바 하단:

```tsx
로그인
회원가입
```

권장 상태별 UI:

```text
guest
  - 로그인
  - 회원가입

profile_incomplete
  - 가입 완료
  - 로그아웃

member
  - 내 정보
  - 로그아웃
```

버튼 동작:

- `로그인`: 로그인 모달 열기
- `회원가입`: 같은 로그인 모달 열기, 문구만 가입 중심으로 표시
- `가입 완료`: 프로필 완성 모달 열기
- `내 정보`: 프로필 요약/수정 모달 열기
- `로그아웃`: `signOut()` 실행 후 모달 닫기

### 6. 워크숍 신청 조건과 연결
`handleWorkshopPayment`는 이미 `!user`, `!isProfileComplete`를 검사한다.

필수 변경점:

- `isProfileComplete` 기준만 정확해지면 워크숍 신청 차단 로직은 유지 가능하다.
- 안내 문구는 `이름, 전화번호` 중심으로 맞춘다.
- 이메일은 OAuth에서 이미 확보되므로 누락 시 내부 저장 보정만 하면 된다.

### 7. 이메일 로그인 폼 처리
현재 이메일 입력 UI는 있지만 실제 handler가 없다.

선택지:

1. 당장은 숨기거나 비활성화한다.
2. Supabase magic link 로그인으로 구현한다.
3. 자체 이메일 인증/비밀번호 가입을 별도 기능으로 분리한다.

지금 정책이 카카오/구글 중심이라면 1번이 가장 안전하다.

## 파일별 변경 계획

### `src/hooks/useAuth.ts`
- `isProfileComplete` 계산 기준을 `full_name + phone + email`로 통일한다.
- `bio` 필수 조건 제거.
- `profile.email`이 비어 있으면 `user.email`을 fallback으로 쓰는 helper 추가 검토.
- `signInWithGoogle`, `signInWithKakao`를 page에서 직접 구현하지 않고 이 hook의 함수를 사용하도록 정리.

### `src/app/page.tsx`
- 중복 OAuth handler 제거 또는 `useAuth`의 handler 사용.
- `setupData`에서 `bio`를 필수값에서 제거.
- 프로필 완성 폼 입력값을 이름/전화번호 중심으로 축소.
- 로그인 상태별 사이드바 하단 버튼 렌더링 추가.
- 로그인 완료 상태의 모달에는 `내 정보`, `로그아웃`, 선택 정보 수정 진입을 배치.

### `src/app/auth/callback/route.ts`
- 모달 중심 플로우로 갈 경우 `/onboarding` redirect 제거.
- OAuth 성공 후 `/` 또는 `next`로 redirect.
- 프로필 완성 여부 판단은 클라이언트의 auth state가 담당.

### `src/app/onboarding/page.tsx`
- 유지한다면 필수 기준을 `full_name + phone + email`로 문서화.
- 메인 플로우가 모달이면 이 페이지는 fallback으로만 사용.
- `bio`는 여기서도 요구하지 않는다.

### `supabase/migrations/20260502000000_initial_schema.sql`
- 현재 구조는 목표 플로우에 대체로 맞는다.
- `handle_new_user`가 `profiles.email`을 저장하므로 OAuth 이메일 저장은 이미 처리된다.
- 진짜로 "필수 정보 완료 전에는 member가 아니다"를 DB 레벨에서 구분하려면 `profiles.completed_at` 또는 `profiles.status` 추가를 검토한다.

## DB 상태 필드 추가 여부
현재는 `full_name`, `phone`, `email` 존재 여부로 회원가입 완료를 판단할 수 있다.

다만 장기적으로는 아래 중 하나를 추가하는 편이 더 명확하다.

```sql
profile_status TEXT DEFAULT 'incomplete'
```

또는

```sql
completed_at TIMESTAMP WITH TIME ZONE
```

추천은 `completed_at`이다.

- 값이 없으면 가입 미완성
- 값이 있으면 가입 완료 시각 확인 가능
- 기존 필드와 충돌이 적음

단, 지금 단계에서는 필수는 아니다. 우선 프론트 로직 정리만으로도 충분히 구현 가능하다.

## UX 문구 기준

### OAuth 직후
```text
인증이 완료되었습니다.
IYOHOUSE 이용과 워크숍 신청을 위해 이름과 전화번호를 입력해 주세요.
```

### 가입 완료
```text
회원가입이 완료되었습니다.
```

### 미완성 상태에서 워크숍 신청
```text
워크숍 신청을 위해 이름과 전화번호를 먼저 입력해 주세요.
```

### 로그인 완료 상태
```text
{full_name}님
내 정보
로그아웃
```

## 권장 작업 순서
1. `useAuth.ts`의 프로필 완성 기준을 먼저 고정한다.
2. `page.tsx`의 프로필 완성 폼에서 `bio` 필수 요구를 제거한다.
3. OAuth handler 중복을 줄이고 `useAuth` 기준으로 통일한다.
4. `auth/callback` redirect를 모달 플로우에 맞게 `/`로 통일한다.
5. 사이드바 하단 버튼을 auth state에 따라 분기한다.
6. `내 정보` 모달/섹션을 추가한다.
7. 이메일 로그인 폼은 구현 전까지 숨기거나 비활성화한다.
8. 워크숍 신청 플로우에서 미완성 프로필 안내 문구를 새 기준으로 맞춘다.

## 검증 체크리스트
- 비로그인 상태에서 사이드바에 `로그인`, `회원가입`이 보인다.
- 카카오/구글 인증 후 메인으로 돌아오고, 이름/전화번호 입력 모달이 열린다.
- 이름/전화번호 저장 전에는 워크숍 신청이 막힌다.
- 이름/전화번호 저장 후 사이드바가 `내 정보`, `로그아웃` 상태로 바뀐다.
- 로그인 완료 후 새로고침해도 `member` 상태가 유지된다.
- 로그아웃 후 다시 `guest` 상태로 돌아간다.
- `bio`가 비어 있어도 회원가입 완료로 판단된다.
- `profiles.email`이 비어 있는 기존 유저도 `auth.users.email` fallback으로 정상 처리된다.

## 주의할 점
- Supabase OAuth는 인증 순간 `auth.users`를 만들기 때문에, "회원가입이 아직 안 됐다"는 말은 DB auth 계정이 없다는 뜻이 아니라 앱 내부 프로필 완료 상태가 아니라는 뜻으로 정의해야 한다.
- `bio`를 필수에서 제거하면 기존 UI의 자기소개 표시 영역은 선택 정보로 바뀌어야 한다.
- `/onboarding`과 모달 플로우를 동시에 주 플로우로 쓰면 사용자 경험이 흔들린다.
- 로그인 관련 변경은 워크숍 결제 차단 조건과 직접 연결되므로 `handleWorkshopPayment` 검증을 함께 확인해야 한다.
