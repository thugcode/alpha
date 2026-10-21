# 알파 웹 — 설치 안내

Claude 아티팩트였던 알파를 일반 웹사이트로 옮긴 버전이다. 누구나 이메일로 로그인해서 쓰고, 기록은 각자 계정에 저장되어 어느 기기에서나 이어진다. 휴대폰에서는 홈 화면에 추가하면 앱처럼 열린다.

- 사이트 파일: GitHub Pages (무료)
- 로그인·기록 저장: Supabase (무료)
- 다 하는 데 20~30분 걸린다. 순서대로 따라 하면 된다.

---

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 에서 가입한다 (GitHub 계정으로 가입하면 편하다).
2. **New project** → 이름 `alpha`, 비밀번호는 아무거나 길게(따로 쓸 일 없음), Region은 **Northeast Asia (Seoul)** → Create.
3. 1~2분 기다리면 프로젝트가 준비된다.

## 2. 데이터베이스 표 만들기

1. 왼쪽 메뉴 **SQL Editor** → **New query**.
2. 이 폴더의 `supabase/schema.sql` 내용을 통째로 붙여 넣고 **Run**.
3. "Success" 가 뜨면 끝. (각자 자기 기록만 읽고 쓸 수 있게 막는 규칙까지 들어 있다.)

## 3. 로그인 메일에 숫자 코드 넣기

홈 화면에 추가한 앱에서 로그인하려면 메일에 숫자 코드가 있어야 한다.

1. 왼쪽 메뉴 **Authentication** → **Emails** (또는 Email Templates).
2. **Magic Link** 템플릿 본문 맨 위에 아래 줄을 추가하고 저장한다.
   ```html
   <h2>알파 로그인 코드: {{ .Token }}</h2>
   ```
3. **Confirm signup** 템플릿에도 같은 줄을 추가하고 저장한다 (처음 가입하는 사람은 이 메일을 받는다).

## 4. 열쇠 두 개 복사하기

1. **Project Settings** → **API** (또는 Data API / API Keys).
2. **Project URL** (`https://xxxx.supabase.co`) 과 **anon public** 키를 복사해 둔다.
   - 이 두 값은 공개돼도 괜찮다. `service_role` 키는 절대 복사해서 올리지 않는다.

## 5. GitHub에 사이트 올리기

1. https://github.com 가입 → 오른쪽 위 **+** → **New repository**.
2. 이름 `alpha`, **Public** 선택 → Create repository.
3. **uploading an existing file** 링크(또는 Add file → Upload files)를 눌러, 이 압축을 푼 폴더 안의 파일과 폴더를 **전부** 끌어다 놓는다 (`index.html`, `config.js`, `vendor` 폴더 등). → **Commit changes**.
4. 저장소에서 `config.js` 를 열고 연필(✏️) 아이콘 → 4번에서 복사한 두 값을 붙여 넣는다.
   ```js
   SUPABASE_URL: "https://xxxx.supabase.co",
   SUPABASE_ANON_KEY: "eyJ...긴 문자열..."
   ```
   → **Commit changes**.
5. 저장소 **Settings** → 왼쪽 **Pages** → Source: **Deploy from a branch**, Branch: **main** / **(root)** → Save.
6. 1~3분 뒤 같은 화면 위쪽에 사이트 주소가 뜬다: `https://<GitHub 아이디>.github.io/alpha/`

## 6. Supabase에 사이트 주소 알려 주기

1. Supabase → **Authentication** → **URL Configuration**.
2. **Site URL** 에 사이트 주소(`https://<아이디>.github.io/alpha/`)를 넣는다.
3. **Redirect URLs** 에도 같은 주소를 추가하고 저장한다.

## 7. 휴대폰에서 앱처럼 쓰기

1. 사파리로 사이트 주소를 연다 → 이메일 입력 → 메일로 온 숫자 코드 입력.
2. 공유 버튼 → **홈 화면에 추가**. 이제 아이콘을 누르면 앱처럼 열린다.
3. 여자친구에게는 사이트 주소만 보내면 된다. 각자 자기 이메일로 로그인하고, 서로의 기록은 보이지 않는다.

## 기존 알파(Claude 아티팩트) 기록 옮기기

1. 기존 알파에서 ⚙ → **기록 백업·복원** → **백업 파일 저장**.
2. 새 사이트에서 로그인 → 첫 소개 화면의 **"전에 쓰던 백업 파일이 있다면 복원하기"** (또는 ⚙ → 백업에서 복원) → 그 파일 선택.

---

## 알아 둘 점

- **매일 아침 브리핑**: 지금 들어 있는 `briefing.json` 은 오늘 기준 내용이다. 매일 자동으로 새로 올라가게 하려면 다음 단계(예약 작업이 이 저장소에 파일을 올리도록 연결)가 필요하다.
- **내 알림 링크 수집**: 등록은 지금도 되지만, 매일 아침 내용을 모아 오는 작업은 위 자동 업데이트를 연결할 때 함께 켠다.
- **로그인 메일 한도**: Supabase 기본 메일 발송은 시간당 몇 통으로 제한된다. 몇 명이 쓰기엔 충분하고, 사용자가 늘면 Authentication → SMTP 설정에서 Resend 같은 메일 서비스를 연결한다.
- **무료 프로젝트 일시 정지**: Supabase 무료 프로젝트는 7일 동안 아무도 접속하지 않으면 잠시 멈춘다. 대시보드에서 Restore 를 누르면 다시 켜진다(기록은 그대로).
- **도메인**: 원하면 나중에 `alpha.kr` 같은 주소를 사서 GitHub Pages에 연결할 수 있다(연 1~2만 원).


---

## 8. 내 알림 링크 '지금 업데이트' 켜기 (하루 3번)

알파 탭의 **내 알림 링크**에서 '지금 업데이트'를 누르면 등록한 링크의 새 글을 바로 가져온다. 이 기능은 Supabase의 작은 서버 함수(Edge Function)가 대신 사이트를 열어 주는 방식이라, 한 번만 설치하면 된다.

1. **표 추가**: Supabase → **SQL Editor** → New query → `supabase/schema.sql` 을 통째로 다시 붙여 넣고 **Run**. (여러 번 실행해도 안전하다. 새로 생기는 건 3번 '업데이트 횟수' 표뿐이다.)
2. **함수 만들기**: Supabase → 왼쪽 **Edge Functions** → **Deploy a new function** → **Via Editor**.
3. 함수 이름을 정확히 `refresh-feeds` 로 적는다.
4. 편집기에 있는 예시 코드를 모두 지우고, 저장소의 `supabase/functions/refresh-feeds/index.ts` 내용을 통째로 붙여 넣는다.
5. **Deploy function** 을 누른다. 1분쯤 뒤 목록에 `refresh-feeds` 가 보이면 끝.

- 횟수는 한국 시간 자정에 다시 3번으로 돌아간다. 횟수는 서버에서 세기 때문에 앱을 고쳐도 늘릴 수 없다.
- 사이트가 robots.txt로 자동 수집을 막아 두었거나, 로그인이 필요하거나, 화면을 연 뒤에 내용을 불러오는 사이트(예: 학교 비교과 시스템)는 가져오지 못하고 카드에 이유가 표시된다.
- 함수가 열 수 있는 주소는 공개된 http/https 주소뿐이다. 내부망·로컬 주소는 막혀 있다.
