// 카카오 로컬 REST API: 주소/장소 → 좌표, 좌표 → 행정구역
// 인증키는 서버 환경변수(KAKAO_REST_API_KEY)로만 사용한다. 브라우저로 내려가지 않는다.

const BASE = 'https://dapi.kakao.com/v2/local';
const TIMEOUT_MS = 8000;

export class KakaoError extends Error {
  /** kind: auth | param | quota | network | upstream */
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

async function kakaoGet(path, params, key) {
  const url = new URL(`${BASE}/${path}.json`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { signal: ctrl.signal, headers: { Authorization: `KakaoAK ${key}` }, cache: 'no-store' });
  } catch (e) {
    throw new KakaoError('network', e?.name === 'AbortError' ? '주소 검색 서버 응답 시간 초과' : '주소 검색 서버에 연결하지 못했습니다');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) throw new KakaoError('auth', '카카오 REST API 키가 올바르지 않습니다 (401)');
  if (res.status === 403) throw new KakaoError('auth', '카카오 로컬 API 사용 권한이 없습니다 — 카카오맵 사용 설정을 확인하세요 (403)');
  if (res.status === 429) throw new KakaoError('quota', '카카오 API 호출 한도를 초과했습니다 (429)');
  if (res.status === 400) throw new KakaoError('param', '검색어가 올바르지 않습니다 (400)');
  if (!res.ok) throw new KakaoError('upstream', `주소 검색 서버 오류 (HTTP ${res.status})`);
  try {
    return await res.json();
  } catch {
    throw new KakaoError('upstream', '주소 검색 응답을 해석하지 못했습니다');
  }
}

/** 반환: [{ name, address, lat, lon, via }] (비어 있을 수 있음). 주소 검색 → 없으면 장소명 검색 */
export async function geocode(query, key) {
  const q = String(query ?? '').trim();
  if (!q) throw new KakaoError('param', '주소를 입력하세요');
  if (q.length > 100) throw new KakaoError('param', '주소가 너무 깁니다');

  const toNum = (v) => (v === undefined || v === null || v === '' ? NaN : Number(v));
  const pick = (docs, via, nameKey) =>
    (docs ?? [])
      .map((d) => ({
        name: d[nameKey] || d.address_name || '',
        address: d.road_address_name || d.address_name || '',
        lat: toNum(d.y),
        lon: toNum(d.x),
        via,
      }))
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));

  const a = await kakaoGet('search/address', { query: q, size: 5 }, key);
  const byAddress = pick(a.documents, '주소 검색', 'address_name');
  if (byAddress.length) return byAddress;
  const k = await kakaoGet('search/keyword', { query: q, size: 5 }, key);
  return pick(k.documents, '장소명 검색', 'place_name');
}

/** 좌표 → { sido, sigungu } 또는 null */
export async function reverseRegion(lat, lon, key) {
  const j = await kakaoGet('geo/coord2regioncode', { x: lon, y: lat }, key);
  const docs = j.documents ?? [];
  const d = docs.find((x) => x.region_type === 'H') ?? docs[0];
  return d ? { sido: d.region_1depth_name || '', sigungu: d.region_2depth_name || '' } : null;
}
