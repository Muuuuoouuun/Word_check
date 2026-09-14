# 단어 시험 자동화 앱 (Homework Delivery & Management Automation)

학생 단말 중심 숙제 대시보드 + 교사용 자동화 보드 + 학부모 보고함을 제공하는 샘플 구현입니다.

- 학생: 오늘 숙제 확인, 시험 응시/제출
- 교사: 과제 생성, 자동 시험 생성, 문항 수동 수정, 엑셀 내보내기/가져오기, CSV 단어장 import
- 학부모: 완료/미완료 자동 보고 확인
- UX 개선: 한 문제 집중형 시험 화면, 상태 요약 KPI, 교사 과제 필터/검색
- 교사 일정: 주간 캘린더 뷰(이전/다음 주 이동, 목록/캘린더/통합 전환)
- 채점 후 오답 기반 보충 문제 자동 생성 API 추가
- 학생 제출 시 오답 기준 보충 과제 자동 생성(교사별 설정값 기반)
- 로그인 확장: 자동 로그인 유지, 일회성 접속 링크, QR 접속
- 교사/관리자: 학생 시험의 오프라인 대리 입력 지원
- 관리자 설정: 기본 마감 시간, 보충 문제 기준, 학생/학부모 알림 정책을 교사별로 저장

## 디자인 컨셉

`메모장 + 아날로그 단어장` 스타일

- 크림색 종이 배경과 줄노트 패턴
- 타자기/손글씨 계열 타이포
- 카드형 단어장 UI
- 과한 네온/디지털 톤 대신 잉크/종이 질감 중심

## 실행

### 학생 모바일 기능 연결

- 모바일 웹과 Expo 앱에서 학습/복습/성장/과제를 하단 메뉴로 이동합니다.
- 모바일 홈의 주 학습 버튼은 하단 메뉴 위에 고정됩니다. 암기가 필요하면 `암기 시작`, 바로 시험을 볼 수 있으면 `테스트 시작`, 진행 중이면 `이어서 테스트`로 안내합니다.
- 과제 화면은 전체 과제를 표시하며, 예정·완료 과제의 시험 시작 버튼은 비활성화하거나 숨깁니다.
- 서버도 예정·완료·취소 시험의 시작 요청을 409로 거절합니다. 시험과 과제 상태를 함께 갱신하며, 이어서 풀 때 기존 시작 시각을 보존합니다.
- 암기가 필요한 과제는 암기 완료 전 `바로 테스트`를 표시하지 않습니다.
- 암기 카드의 `발음 듣기`는 웹의 브라우저 음성 합성, Expo의 `expo-speech`를 사용합니다. 발음 기호 데이터는 제공하지 않습니다.
- Expo 성장 화면도 서버의 `learningSummary`(숙련도, 복습 예정, 약점 단어)를 사용합니다.
- 복습은 답을 다시 입력해 서버가 정답으로 판정한 단어만 저장합니다. 모든 단어를 맞히면 완료·XP·연속 학습을 반영하며, 반복 제출은 보상을 중복 지급하지 않습니다.
- `POST /students/review-sets/:id/complete`는 `{ "answers": [{ "itemId": "복습 항목 ID", "response": "입력한 답" }] }`를 받습니다. 부분 정답은 `OPEN` 상태와 `checks`를 반환하며 완료 보상은 없습니다. 웹과 모바일 클라이언트를 서버와 함께 업데이트해야 합니다.
- `npm test`는 별도 임시 DB에서 복습 판정, 권한, 중복 보상, 트랜잭션 롤백, 전체 과제 조회를 검증합니다.

```bash
npm install
npm run init-db
npm run seed
npm run dev
```

- 앱: `http://localhost:4002`
- API: 같은 호스트에서 `/auth`, `/students`, `/teacher`, `/parents`

## 데모 계정

- 교사: `teacher@example.com / pass1234`
- 관리자: `admin@example.com / pass1234`
- 학생: `student@example.com / pass1234`
- 학부모: `parent@example.com / pass1234`

## 주요 API

- `POST /auth/login`
- `POST /auth/access-links`
- `POST /auth/access-links/exchange`
- `GET /students/me/dashboard`
- `GET /students/test-sessions/:id/questions`
- `POST /students/test-sessions/:id/start`
- `POST /students/test-sessions/:id/submit`
  - 응답에 `supplementalCreated`, `supplementalAssignmentId`, `supplementalSessionId` 포함
- `GET /teacher/meta`
- `GET /teacher/settings`
- `PUT /teacher/settings`
- `GET /teacher/assignments`
- `POST /teacher/assignments`
- `POST /teacher/assignments/:id/generate`
- `POST /teacher/assignments/:id/publish-now`
- `GET /teacher/assignments/:id/export.xlsx`
- `POST /teacher/assignments/:id/import.xlsx` (multipart, field=`file`)
- `POST /teacher/test-sessions/:id/override`
- `POST /teacher/test-sessions/:id/offline-submit` (교사/관리자 오프라인 대리 입력)
- `POST /teacher/test-sessions/:id/supplement` (오답 단어 기반 보충 과제 생성)
- `POST /teacher/vocab/import/csv` (multipart, field=`file`)
- `GET /parents/me/reports`

## 자동화 설정

교사 화면의 `자동화 설정` 카드에서 아래 값을 교사별로 저장할 수 있습니다.

- `default_assignment_due_hours`: 과제 생성 시 기본 마감 시간
- `supplement_min_wrong`: 자동 보충 생성 최소 오답 수
- `supplement_max_questions`: 자동 보충 최대 문항 수
- `supplement_due_hours`: 보충 과제 기본 마감 시간
- `notify_student_on_publish`: 학생 즉시 배정 알림 사용 여부
- `notify_student_on_reminder`: 학생 미완료 리마인드 사용 여부
- `student_reminder_delay_minutes`: 마감 후 MISSED 확정 전 유예 시간
- `notify_parent_on_completed`: 학부모 완료 보고 사용 여부
- `notify_parent_on_missed`: 학부모 미완료 보고 사용 여부

## CSV Import 포맷

```csv
lesson_no,lesson_title,lemma,meaning_primary,example_sentence
1,Lesson 1,apple,사과,I ate an apple this morning.
```

## 자동화 파이프라인

- 매 1분 Cron
- `SCHEDULED` 과제 자동 게시 + 시험 생성 + Tier1 학생 알림(설정에 따라 비활성화 가능)
- 마감 초과 미완료: Tier2 학생 리마인드 후 유예 시간 경과 시 MISSED 처리 + Tier3 학부모 경고
- 완료 시: Tier3 점수 보고
