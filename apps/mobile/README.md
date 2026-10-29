# Words Check Mobile

학생/학부모가 기존 Words Check 백엔드 API에 접속하는 Expo 모바일 앱입니다.

## 실행

```bash
cd apps/mobile
npm install
npm run start
```

백엔드 서버는 별도로 실행되어 있어야 합니다.

```bash
cd ../..
npm run dev
```

## API 서버 주소

앱은 기본적으로 아래 주소를 사용합니다.

- Android emulator: `http://10.0.2.2:4002`
- iOS simulator/web: `http://localhost:4002`

실제 휴대폰에서 테스트할 때는 PC의 같은 Wi-Fi LAN IP를 사용하세요.

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.0.10:4002 npm run start
```

로그인 화면에서도 API 서버 주소를 직접 바꿀 수 있습니다.

## 현재 구현 범위

- 학생 로그인
- 학생 오늘 과제 대시보드
- 하단 메뉴와 화면 아래에 고정된 주 학습 버튼
- 암기 미리보기
- 홈/암기 화면의 영어 발음 듣기
- 한 문제 집중 시험
- 답안 임시 저장
- 제출 결과
- 복습 답안 확인, 부분 완료 저장, 전체 정답 후 복습 완료
- 숙련도·복습 예정·약점 단어·XP 성장 정보
- 학부모 보고함 읽기

## 검증

`npm run typecheck`로 타입을 검사합니다. `npx expo export --platform android --output-dir <출력경로>`로 Android용 JavaScript/Hermes 번들을 검증할 수 있습니다. 이 출력은 설치용 APK가 아닙니다.

2026-09-07: 타입 검사 및 Android 번들 생성 통과. 실제 Android/iOS 기기의 터치·키보드·음성 출력은 별도 확인이 필요합니다. 변경된 복습 API를 사용하므로 서버와 앱을 함께 업데이트하세요.
