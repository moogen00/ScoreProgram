# Score Program - Real-time Competition Manager

실시간 점수 집계 및 대형 스크린 디스플레이를 위한 웹 애플리케이션입니다.
심사위원의 태블릿/모바일 채점이 즉시 서버에 반영되어 관객과 관리자가 실시간으로 결과를 확인할 수 있습니다.

## ✨ 주요 기능 (Key Features)

- **실시간 동기화 (Real-time Sync)**: Firebase Firestore를 활용하여 모든 기기 간 데이터가 0.1초 내로 동기화됩니다.
- **모바일 최적화 (Mobile First)**: 심사위원은 스마트폰/태블릿에서 카드형 UI로 편리하게 채점할 수 있습니다.
- **관리자 패널 (Admin Panel)**:
  - 참가자/심사위원 관리
  - 실시간 QR 코드 공유 (`QR Connect`) 생성
  - 데이터 JSON 백업 및 복구
- **관람객 모드 (Spectator Mode)**: 로그인 없이 QR 코드로 접속하여 실시간 순위를 관람할 수 있습니다.
- **보안 (Security)**: 구글 로그인 기반의 관리자/심사위원 인증 시스템.

---

## 🚀 시작하기 (Getting Started)

### 1. 필수 프로그램 설치
- [Node.js](https://nodejs.org/) (v18 이상 권장)
- [Git](https://git-scm.com/)

### 2. 프로젝트 설치
터미널(PowerShell 또는 Terminal)을 열고 프로젝트 폴더로 이동하여 의존성 패키지를 설치합니다.
```bash
npm install
```

### 3. 환경 변수 설정 (.env)
프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 설정해야 합니다. (기존 `.env` 참조)

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
# ... (기타 Firebase 설정)

# Google Auth
VITE_GOOGLE_CLIENT_ID=...
VITE_ROOT_ADMIN_EMAILS=admin@gmail.com

# Feature Flags
VITE_ENABLE_SPECTATOR=true  # 관람객 입장 버튼 활성화 여부
```

---

## 💻 개발 환경 실행 (Development)

로컬 컴퓨터에서 개발 서버를 실행합니다.
```bash
npm run dev
```
- **주소**: `http://localhost:5173`
- **외부 접속**: 같은 와이파이 내의 스마트폰에서 접속하려면 `http://192.168.x.x:5173` (터미널에 표시됨)으로 접속하세요.

### 🛠 개발자 전용 기능 (Dev Only)
`npm run dev`로 실행 시에만 보이는 기능들입니다:
- **Dev Login**: 관리자/심사위원 권한으로 원클릭 가상 로그인.
- **Random Data**: 테스트용 랜덤 점수 자동 생성 도구.
- **Local Network URL**: QR 코드 팝업에 로컬 접속 주소 표시.

---

## 🌐 서버 배포 (Deployment)

실제 사용자들에게 보여줄 상용 서버(Firebase Hosting)로 배포합니다.

### 1. 배포 명령어
빌드(Build)와 업로드(Deploy)를 한 번에 수행합니다.
```bash
npm run deploy
```
> **참고**: 위 명령어는 `npm run build && npx firebase-tools deploy --only hosting`의 단축 명령어입니다.

### 2. 배포 확인
배포가 완료되면 터미널에 표시된 Hosting URL로 접속합니다.
- 예: `https://scoreprogram-f8fbb.web.app`

---

## 📂 프로젝트 구조

```
src/
├── components/     # UI 컴포넌트 (AdminPanel, Scorer, Leaderboard 등)
├── store/          # 상태 관리 (Zustand + Firebase Firestore 연동)
├── lib/            # 라이브러리 설정 (Firebase config)
└── App.jsx         # 메인 라우팅 및 레이아웃
```

## ⚠️ 문제 해결 (Troubleshooting)

**Q. 배포 시 인증 오류가 발생해요.**
A. 터미널에서 `npx firebase-tools login --reauth` 명령어로 다시 로그인해주세요.

**Q. 모바일에서 접속이 안 돼요.**
A. PC와 모바일이 **같은/동일한 와이파이**에 연결되어 있는지 확인하세요. Windows 방화벽 설정을 확인해야 할 수도 있습니다.
