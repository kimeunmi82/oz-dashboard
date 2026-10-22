# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

호흡기 질환(J코드) 진료비 격차 모니터링 대시보드. 상세한 인터뷰 결과·결정 로그·데이터 메모는 `README.md`에 있으니 지표 정의나 기준을 바꾸기 전에 읽을 것.

## Commands
```bash
python3 build.py                  # Google Sheet 다운로드 → data/*.csv → 무결성 검증 → site/data/*.json
python3 -m http.server -d site    # http://localhost:8000 (또는 .claude/launch.json의 미리보기 서버)
```
테스트·린트 설정은 없다. 검증은 `build.py`의 `check()`(키 고아, 총액 = 본인부담 + 보험자부담 등)와 화면 확인으로 한다.

## Architecture
데이터 흐름은 한 방향이다: `Google Sheet → data/*.csv(gitignore) → build.py 집계 → site/data/*.json(gitignore) → site/app.js(d3)가 fetch해서 렌더`.

- `build.py`: 표준 라이브러리만 사용(새 의존성은 README 결정 로그에 기록). 지표 하나 = 함수 하나이며 `AGGREGATES` 딕셔너리에 등록하면 같은 이름의 JSON이 생긴다. 이름 통일 규칙: 함수 `x()` → `x.json` → 차트 `x`.
- `site/app.js`: `IDS` 목록의 JSON을 `data/<id>.json`으로 fetch해 `DATA[id]`에 담는다(실패 시 null). 브라우저는 집계된 JSON만 읽고 원본 CSV는 절대 읽지 않는다. d3는 `site/vendor/`에 포함(CDN 미사용), 디자인 토큰은 Montage 값을 `style.css`에 적용.
- Supabase: `supabase/migrations/`의 `metrics(id, data jsonb)` 테이블에 지표 하나 = 행 하나로 저장. `build.py`가 `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` 환경변수가 있을 때만 upsert(service_role, `.env` 또는 GitHub Secrets). `site/config.js`에 URL/anon 키가 있으면 `app.js`가 REST로 읽고, 비어 있으면 로컬 JSON을 읽는다. RLS는 anon select만 허용. 스키마 변경은 `supabase migration new <name>` → `supabase db push`.
- 임계값 상수는 `build.py` 상단: `MIN_N`(기관 순위 최소 표본 8), `FLAG_RATIO`(기관 경고 1.5배), `CHANGE_FLAG`(월별 ±10%, 화면에 표시되는 반올림 값으로 판정).
- 배포: `main` push 및 매월 5일 `.github/workflows/deploy.yml`이 `build.py` 실행 후 `site/`를 GitHub Pages에 올린다. Pages는 공개 주소이므로 실제 청구 데이터로 바꾸기 전에 배포 방식을 재검토해야 한다.

## 도메인 주의점
- 대표 지표는 중앙값 + P25/P75(이상치 때문에 평균 단독 금지). 비교는 연령대×성별 직접표준화 보정 중앙값, 표본 수 n은 숨기지 않고 표시.
- 기관은 익명 `yid`뿐이다. `hospital_open` 테이블은 `claim`과 연결 키가 없어 사용 불가.
- 항생제 판정은 약효분류 번호만으로 하지 않고 `ABX_CLASSES` + `NON_ABX_NAME`(성분명 제외 규칙)을 함께 쓴다.
- 분리 기준: `build.py`/`app.js` 300줄 초과, 화면 2개 이상일 때만 폴더 분리.
