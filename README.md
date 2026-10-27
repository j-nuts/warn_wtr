# 현장 기상특보 판정 (Next.js · Netlify 배포용)

현장 주소(또는 현재 위치)를 입력하면 해당 지역의 기상특보가 **발효 중 / 발효 예정 / 없음**인지 판정합니다.
`/api` 는 Next.js Route Handler(서버리스 함수)이며, API 키는 서버 환경변수로만 사용되어 브라우저로 내려가지 않습니다.

## 로컬 실행

```bash
npm install
cp .env.example .env.local     # 키 입력 (Windows: copy .env.example .env.local)
npm run dev                    # http://localhost:3000
npm test                       # 지역 매칭·유효성 판정 단위 테스트
```

## 필요한 키

| 환경변수 | 발급처 | 비고 |
|---|---|---|
| `KMA_SERVICE_KEY` | 공공데이터포털 | **기상청_기상특보 조회서비스(15000415)** 활용신청 |
| `KAKAO_REST_API_KEY` | Kakao Developers | 카카오맵(로컬) 사용 설정 — 주소 검색, 좌표 → 행정구역 |

## Netlify 배포

1. 이 `demo` 폴더를 Git 저장소로 올립니다. (모노레포라면 Netlify의 *Base directory* 를 `demo` 로 지정)
2. Netlify → **Add new site → Import an existing project** 에서 저장소 선택. 빌드 설정은 `netlify.toml` 이 처리합니다
   (`npm run build`, Next.js는 자동 감지).
3. **Site configuration → Environment variables** 에 `KMA_SERVICE_KEY`, `KAKAO_REST_API_KEY` 등록 후 배포.
4. CLI로 배포하려면: `npx netlify-cli deploy --build --prod`

## 주의

- 공개 배포하면 누구나 이 사이트로 **본인의 공공데이터/카카오 호출 한도**를 쓰게 됩니다. `/api/warnings` 는 CDN에 2분, `/api/geocode` 는 하루 캐시하지만,
  남용이 걱정되면 Netlify의 접근 제한(비밀번호)이나 속도 제한을 함께 쓰세요.
- 지역 매칭은 시도·시군 이름 기준이고 육상 특보만 대상입니다. "시군 일부 구역"은 현장 해당 여부를 확인해야 합니다. 안전·법적 판단의 근거로 쓰지 마세요.
