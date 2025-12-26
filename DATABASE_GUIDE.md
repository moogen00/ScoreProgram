# Database Management Documentation

이 프로젝트는 **Firebase Firestore**를 실시간 데이터베이스로 사용합니다. 모든 대회 데이터(연도, 종목, 참가자, 점수)는 Firebase 서버에 저장됩니다.

## 1. 데이터베이스 접속 및 확인 방법

1.  [Firebase Console](https://console.firebase.google.com/)에 접속합니다.
2.  프로젝트 목록에서 해당 프로젝트를 선택합니다.
3.  왼쪽 메뉴에서 **Build > Firestore Database**를 클릭합니다.

## 2. 주요 데이터 구조 (Collections)

| 컬렉션 이름 | 설명 | 주요 필드 |
| :--- | :--- | :--- |
| **`years`** | 연도 및 대회 종목 정보 | `id`, `name`, `categories` (Array) |
| **`participants`** | 참가자 명단 | `id`, `categoryId`, `number`, `name` |
| **`judges`** | 심사위원 권한 정보 | `email`, `name` |
| **`scores`** | 심사 결과 (점수) | `values` (Map: itemId -> score) |
| **`settings`** | 전역 설정 (채점 항목 등) | `items` (Array) |

## 3. 관리자 주의사항

-   **데이터 직접 수정**: Firebase Console에서 직접 데이터를 수정하거나 삭제할 수 있습니다. 수정 시 즉시 모든 접속 사용자에게 실시간으로 반영됩니다.
-   **백업**: 중요한 대회 전에는 Firestore의 [Export](https://firebase.google.com/docs/firestore/manage-data/export-import) 기능을 사용하여 데이터를 백업해 두는 것을 권장합니다.
-   **권한 관리**: `judges` 컬렉션에 이메일을 등록해야 해당 사용자가 '심사위원' 권한으로 점수를 입력할 수 있습니다. 운영자는 `useStore.js`의 `ADMIN_EMAILS`에 등록된 이메일을 사용해야 합니다.

## 4. 로컬 인스턴스 설정

현재 코드는 `src/lib/firebase.js`에 플레이스홀더로 설정되어 있습니다. 실제 운영을 위해서는 본인의 Firebase 프로젝트 설정값을 해당 파일에 복사해야 합니다.
