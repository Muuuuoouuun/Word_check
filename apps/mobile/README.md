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
- 암기 미리보기
- 한 문제 집중 시험
- 답안 임시 저장
- 제출 결과
- 오답 복습 완료
- 학부모 보고함 읽기
