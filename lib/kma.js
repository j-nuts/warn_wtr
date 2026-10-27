// 기상청 기상특보 조회서비스(공공데이터포털) 호출 + 현장 특보 판정
//   WthrWrnInfoService/getPwnStatus  전국 현재 발효 중 특보·예비특보 현황
//   WthrWrnInfoService/getWthrWrnMsg 특보 통보문(발표·변경·연장·해제 + 이벤트별 발효 시각)
// 값을 얻지 못하면 "특보 없음"이 아니라 오류 상태로 돌려준다.

import { activeWarningsFor, preliminaryFor, parseEventLog, evaluateEvents } from './warnings.js';

const BASE_URL = 'https://apis.data.go.kr/1360000';
const KST_MS = 9 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 9000;

const pad = (n) => String(n).padStart(2, '0');
const kst = (ms = Date.now()) => new Date(ms + KST_MS); // getUTC* 로 읽으면 KST 값
const ymd = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const hhmm = (d) => `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
const isoKst = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}+09:00`;

export class KmaError extends Error {
  /** kind: auth | quota | nodata | param | upstream | network | parse */
  constructor(kind, message, code) {
    super(message);
    this.kind = kind;
    this.code = code;
  }
}

const CODE_MAP = {
  '01': ['upstream', '기상청 게이트웨이 내부 오류'],
  '03': ['nodata', '조회된 자료 없음'],
  '04': ['upstream', 'HTTP 오류(요청 방식/URL 확인)'],
  '05': ['upstream', '기관 서비스 연결 실패 또는 응답 시간 초과'],
  '10': ['param', '요청 파라미터 오류'],
  '11': ['param', '필수 요청 파라미터 누락'],
  '12': ['param', '서비스가 없거나 폐기됨'],
  '20': ['auth', '서비스 접근 거부 — 기상특보 조회서비스 활용신청/승인 여부 확인'],
  '21': ['auth', '일시적으로 사용할 수 없는 인증키'],
  '22': ['quota', '일일 호출 한도 초과'],
  '23': ['quota', '초당 호출 한도 초과 — 잠시 후 다시 시도'],
  '30': ['auth', '등록되지 않은 인증키 — 키 값/인코딩 확인'],
  '31': ['auth', '인증키 사용 기한 만료'],
  '32': ['auth', '등록되지 않은 IP'],
};

/** 인코딩된 키(%2B 등)와 디코딩된 키를 모두 받아 디코딩된 원문으로 통일 */
export function normalizeKey(raw) {
  const k = String(raw ?? '').trim();
  if (!k) return '';
  if (/%[0-9A-Fa-f]{2}/.test(k)) {
    try {
      return decodeURIComponent(k);
    } catch {
      return k;
    }
  }
  return k;
}

/** 게이트웨이 응답 본문(JSON 또는 XML 오류) 해석. 정상이면 { items, totalCount } */
export function parseGatewayBody(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (json) {
    const header = json?.response?.header ?? json?.OpenAPI_ServiceResponse?.cmmMsgHeader ?? json;
    const code = String(header?.resultCode ?? header?.returnReasonCode ?? '');
    if (code && code !== '00') {
      const [kind, msg] = CODE_MAP[code] ?? ['upstream', `기상청 응답 오류(${code})`];
      throw new KmaError(kind, msg, code);
    }
    if (!json.response) throw new KmaError('parse', '예상하지 못한 응답 형식', code);
    const body = json.response.body ?? {};
    let items = body.items;
    if (items === '' || items == null) items = [];
    else if (items.item !== undefined) items = Array.isArray(items.item) ? items.item : [items.item];
    else if (!Array.isArray(items)) items = [];
    return { items, totalCount: Number(body.totalCount ?? items.length) };
  }
  const tag = (t) => (text.match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1];
  const code = tag('returnReasonCode') || tag('resultCode');
  if (code) {
    const [kind, msg] = CODE_MAP[String(code).padStart(2, '0')] ?? ['upstream', `기상청 응답 오류(${code})`];
    throw new KmaError(kind, msg, code);
  }
  throw new KmaError('parse', '응답을 해석하지 못했습니다');
}

async function callDataGo(service, op, params, key) {
  const url = new URL(`${BASE_URL}/${service}/${op}`);
  url.searchParams.set('serviceKey', normalizeKey(key));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('dataType', 'JSON');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
  } catch (e) {
    throw new KmaError('network', e?.name === 'AbortError' ? '기상청 서버 응답 시간 초과' : '기상청 서버에 연결하지 못했습니다');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok && !text.trim()) throw new KmaError('upstream', `기상청 서버 HTTP ${res.status}`);
  return parseGatewayBody(text);
}

// 서버리스 인스턴스 단위 소형 캐시(같은 통보문을 반복 호출하지 않기 위함 — 일일 호출 한도 절약)
const cache = new Map();
const cacheGet = (k) => {
  const e = cache.get(k);
  if (!e) return undefined;
  if (e.exp < Date.now()) {
    cache.delete(k);
    return undefined;
  }
  return e.v;
};
const cacheSet = (k, v, ttlMs) => cache.set(k, { v, exp: Date.now() + ttlMs });

async function fetchPwnStatus(key) {
  const hit = cacheGet('pwn');
  if (hit) return hit;
  const r = await callDataGo('WthrWrnInfoService', 'getPwnStatus', { pageNo: 1, numOfRows: 10 }, key);
  if (!r.items.length) throw new KmaError('nodata', '조회된 자료 없음', '03');
  const latest = [...r.items].sort((a, b) => String(b.tmFc).localeCompare(String(a.tmFc)))[0];
  cacheSet('pwn', latest, 3 * 60 * 1000);
  return latest;
}

/** 최근 5일 통보문(전국, stnId=108) */
async function fetchEventLog(key) {
  const hit = cacheGet('wrnlog');
  if (hit) return hit;
  const from = ymd(kst(Date.now() - 4 * 24 * 3600 * 1000));
  const to = ymd(kst());
  const items = [];
  try {
    for (let page = 1; page <= 5; page++) {
      const r = await callDataGo('WthrWrnInfoService', 'getWthrWrnMsg', { pageNo: page, numOfRows: 100, stnId: 108, fromTmFc: from, toTmFc: to }, key);
      items.push(...r.items);
      if (items.length >= r.totalCount || r.items.length === 0) break;
    }
  } catch (e) {
    if (e.kind !== 'nodata') throw e;
  }
  cacheSet('wrnlog', items, 3 * 60 * 1000);
  return items;
}

const fail = (status, note) => ({ status, note });

/** region: { sido, sigungu } → 현장 특보 판정 결과 */
export async function getWarningsFor({ key, region }) {
  if (!normalizeKey(key)) return fail('no_key', '기상청 인증키(KMA_SERVICE_KEY)가 서버에 설정되지 않았습니다.');
  if (!region?.sido) return fail('error', '현장 행정구역을 확인하지 못해 판정하지 않았습니다.');
  try {
    const [p, log] = await Promise.all([fetchPwnStatus(key), fetchEventLog(key)]);
    const nowStamp = `${ymd(kst())}${hhmm(kst())}`;
    const events = parseEventLog(log);
    const active = evaluateEvents(events, region, nowStamp);
    // 조회 범위(5일)보다 먼저 발표돼 이벤트 로그에 없는 장기 특보는 현황 통보문(t6)으로 보완
    const known = new Set(events.map((e) => e.type));
    for (const w of activeWarningsFor(p.t6, region)) {
      if (!known.has(w.type)) active.push({ ...w, state: 'in_effect', since: null, releaseAt: null, releaseNotice: null });
    }
    const preliminary = preliminaryFor(p.t7, region);
    const verdict = active.some((w) => w.state === 'in_effect') ? 'in_effect' : active.some((w) => w.state === 'upcoming') ? 'upcoming' : 'none';
    return {
      status: 'ok',
      verdict,
      asOf: isoKst(kst()),
      region: { sido: region.sido, sigungu: region.sigungu || '' },
      announcedAt: String(p.tmFc ?? ''),
      active,
      preliminary,
      note: '최근 5일 특보 통보문의 발표·변경·해제 이벤트와 이벤트별 발효 시각을 현재 시각(KST)과 비교해 판정했습니다. 육상 특보만 대상이며, 지역 매칭은 시도·시군 이름 기준입니다. "시군 일부 구역"은 현장이 실제로 그 구역에 속하는지 확인이 필요합니다. 법적·안전 판단의 근거로 쓰지 말고 기상청 발표를 함께 확인하세요.',
    };
  } catch (e) {
    if (e instanceof KmaError) return fail('error', `조회 실패 — ${e.message}`);
    throw e;
  }
}
