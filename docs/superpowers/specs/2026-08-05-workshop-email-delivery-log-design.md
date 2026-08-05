# 워크숍 이메일 발송 이력 설계

## 목표

관리자 워크숍 신청자 목록에서 각 확정 신청자에게 이메일을 보낸 적이 있는지 즉시 확인할 수 있게 한다. 현재 발송 API의 성공·실패 집계는 유지하고, 발송 이력은 신청·결제 데이터와 분리해 저장한다.

## 상태 기준

- `sent`: Resend가 발송 요청을 접수한 상태. 관리자 화면에서 즉시 `메일 발송됨`으로 표시한다.
- `delivered`: Resend 웹훅으로 실제 전달 완료를 확인한 상태.
- `failed`: 발송 API가 해당 수신자 발송에 실패한 상태.
- `bounced`: Resend 웹훅으로 반송을 확인한 상태.

`sent`, `delivered`, `bounced`는 발송 이력이 있는 대상으로 간주한다. `failed`만 성공 발송 이력이 없는 것으로 표시한다. 여러 번 발송하면 모든 시도를 기록하고, 관리자 목록에는 가장 최근 시도를 표시한다.

## 데이터 모델

새 Supabase 테이블 `workshop_email_delivery_logs`를 추가한다.

- `id UUID PRIMARY KEY`
- `workshop_id UUID NOT NULL`
- `registration_id UUID NOT NULL`
- `recipient_email TEXT NOT NULL` — 발송 당시 이메일 스냅샷
- `recipient_name TEXT` — 발송 당시 이름 스냅샷
- `template_key TEXT` — 공통 템플릿 또는 일정 템플릿 식별자
- `subject TEXT NOT NULL` — 실제 발송 제목 스냅샷
- `status TEXT NOT NULL` — `sent | delivered | failed | bounced`
- `provider_message_id TEXT` — Resend message ID
- `batch_id TEXT` — 한 번의 관리자 일괄 발송 식별자
- `failure_reason TEXT`
- `sent_by UUID` — 발송 관리자
- `sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

`registration_id`, `workshop_id`, `status`, `sent_at DESC` 인덱스를 추가한다. 결제 테이블이나 신청 상태를 수정하지 않는다.

## 발송 API 흐름

1. 관리자 권한을 확인한다.
2. 기존처럼 확정 신청자와 Sanity 템플릿을 조회한다.
3. Resend batch 발송 결과를 수신자별로 정리한다.
4. Resend가 접수한 수신자마다 `sent` 이력 행을 저장한다.
5. 실패한 수신자는 `failed` 이력으로 저장하고 기존 실패 집계를 반환한다.
6. 응답에는 기존 `sentCount`, `failedCount`, `errors`를 유지한다.

발송 API 재시도 시 같은 batch가 중복 기록되지 않도록 `batch_id + registration_id + provider_message_id` 조합을 중복 방지 기준으로 사용한다. 발송 전에 중복을 막아 재발송 자체를 차단하지는 않는다.

## Resend 웹훅

별도 관리자 웹훅 경로에서 서명 검증 후 `provider_message_id`로 이력 행을 찾아 `delivered` 또는 `bounced`로 갱신한다. 매칭되지 않는 메시지는 무시하고 200을 반환한다. 웹훅 재전송에도 같은 상태 갱신이 반복 가능하도록 만든다.

## 관리자 UI

확정 신청자 테이블에 다음 정보를 추가한다.

- `메일 상태`: `미발송`, `메일 발송됨`, `전달 완료`, `반송`, `발송 실패`
- 최근 발송 시각
- 필요 시 `메일 이력` 상세 보기
- `미발송 대상만 보기` 필터

신청자 기본 정보, 결제 금액, 결제 상태, 정원 표시 레이아웃은 변경하지 않는다. 모바일에서는 상태와 시각을 한 셀 안에서 줄바꿈해 기존 가로 스크롤 구조를 유지한다.

## 권한 및 개인정보

- 이력 조회·생성·갱신은 서버 관리자 경로에서만 수행한다.
- 일반 사용자에게 테이블 직접 접근 권한을 부여하지 않는다.
- 이메일·이름은 기존 관리자 신청자 화면과 동일한 관리자 권한 범위에서만 반환한다.
- 웹훅은 Resend 서명을 검증하고, provider message ID 외의 민감한 원문은 저장하지 않는다.

## 검증 기준

- 처음 발송한 신청자는 즉시 `메일 발송됨`으로 표시된다.
- 같은 신청자에게 다시 보내면 기존 이력은 보존되고 최근 발송이 표시된다.
- Resend 발송 실패는 `발송 실패`로 기록된다.
- `delivered` 웹훅 수신 후 `전달 완료`로 바뀐다.
- `bounced` 웹훅 수신 후 `반송`으로 바뀐다.
- 메일 API 실패가 결제·신청 상태를 변경하지 않는다.
- 관리자 아닌 사용자는 이력 API와 테이블에 접근할 수 없다.
