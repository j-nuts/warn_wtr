// 기상특보 현황(getPwnStatus) 본문 해석 + 현장 행정구역 매칭 (순수 함수, 네트워크 없음)
//
// 입력 텍스트 형식 (기상청 특보 통보문)
//   t6 (현재 발효 중):  "o 강풍주의보 : 서해5도, 충청남도(태안, 당진), 제주도(서귀포시중산간 제외), 대전\r\no 한파주의보 : ..."
//   t7 (예비특보):     "(1) 풍랑 예비특보\r\no 10월 27일 오후(12시~18시) : 동해남부앞바다(경북남부앞바다)\r\n(2) 강풍 예비특보\r\no ... : 경상북도(영덕, 포항), 울산"
// 지역 표기: "시도(구역, 구역)" = 해당 구역만, "시도(구역, 구역 제외)" = 시도 전체에서 해당 구역 제외, "시도" = 시도 전체.

const SIDO_FULL = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종'];

/** 카카오/기상청의 시도 표기를 기상청 특보 표기로 통일 */
export function normSido(s) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  for (const k of SIDO_FULL) if (t.startsWith(k)) return k;
  if (t.startsWith('경기')) return '경기도';
  if (t.startsWith('강원')) return '강원도';
  if (t.startsWith('충청북') || t.startsWith('충북')) return '충청북도';
  if (t.startsWith('충청남') || t.startsWith('충남')) return '충청남도';
  if (t.startsWith('전북') || t.startsWith('전라북')) return '전북자치도';
  if (t.startsWith('전라남') || t.startsWith('전남')) return '전라남도';
  if (t.startsWith('경상북') || t.startsWith('경북')) return '경상북도';
  if (t.startsWith('경상남') || t.startsWith('경남')) return '경상남도';
  if (t.startsWith('제주')) return '제주도';
  return t;
}

/** "수원시 장안구" → "수원", "가평군" → "가평", "서귀포시" → "서귀포" */
export function sigunguBase(s) {
  const first = String(s ?? '').trim().split(/\s+/)[0] ?? '';
  return first.length >= 3 && /[시군구]$/.test(first) ? first.slice(0, -1) : first;
}

/** 최상위 쉼표로만 분리(괄호 안 쉼표는 유지) */
function splitTop(text, depthLimit = 0) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === depthLimit) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

// 시도 표기가 아니지만 시군 소속이 분명한 구역
const STANDALONE_ALIAS = { '울릉도.독도': { sido: '경상북도', names: ['울릉도.독도'] } };

/** "충청남도(태안, 당진), 서해5도, 대전" → [{ sido, whole, exclude, names:[{name, partial}] }] */
export function parseRegions(text) {
  const entries = [];
  for (const raw of splitTop(String(text ?? ''))) {
    const m = raw.match(/^([^()]+?)\s*\((.*)\)\s*$/s);
    if (!m) {
      if (STANDALONE_ALIAS[raw]) {
        entries.push({ sido: STANDALONE_ALIAS[raw].sido, whole: false, exclude: false, names: STANDALONE_ALIAS[raw].names.map((name) => ({ name, partial: false })) });
      } else {
        entries.push({ sido: normSido(raw), label: raw, whole: true, exclude: false, names: [] });
      }
      continue;
    }
    let inner = m[2].trim();
    const exclude = /제외\s*$/.test(inner);
    if (exclude) inner = inner.replace(/\s*제외\s*$/, '');
    const names = splitTop(inner).map((n) => {
      const nm = n.match(/^([^()]+?)\s*\(.*제외\s*\)$/s); // "신안(흑산면제외)" → 일부만 제외
      return nm ? { name: nm[1].trim(), partial: true } : { name: n.replace(/\s*제외\s*$/, '').trim(), partial: false };
    });
    entries.push({ sido: normSido(m[1]), label: m[1].trim(), whole: false, exclude, names });
  }
  return entries;
}

/**
 * 현장 행정구역이 특보 지역에 해당하는지.
 * 반환: null(해당 없음) 또는 { scope, partial, matched }
 *  - partial: 시군 안의 일부 구역(예: 여주동남부, 평창산지)만 해당하거나 일부가 제외된 경우 → 현장이 실제로 포함되는지 단정할 수 없음
 */
export function matchRegion(entries, region) {
  // 카카오가 "전남광주통합특별시"로 주는 경우: 구(區)면 광주 시내, 시·군이면 전라남도로 구분
  const rawSido = String(region?.sido ?? '');
  const sido = rawSido.startsWith('전남광주') ? (/구$/.test(String(region?.sigungu ?? '').trim().split(/\s+/)[0]) ? '광주' : '전라남도') : normSido(rawSido);
  const base = sigunguBase(region?.sigungu);
  if (!sido) return null;
  for (const e of entries) {
    if (e.sido !== sido) continue;
    if (e.whole) return { scope: '시도 전체', partial: false, matched: e.label };
    const hits = base ? e.names.filter((n) => n.name.startsWith(base)) : [];
    if (!e.exclude) {
      if (!hits.length) continue;
      const exact = hits.find((h) => h.name === base && !h.partial);
      return exact
        ? { scope: '시군 전체', partial: false, matched: exact.name }
        : { scope: '시군 일부 구역', partial: true, matched: hits.map((h) => h.name).join(', ') };
    }
    // 제외 목록: 시도 전체에서 일부 제외
    if (!hits.length) return { scope: '시도 전체(일부 제외)', partial: false, matched: e.label };
    if (hits.some((h) => h.name === base && !h.partial)) continue; // 현장 시군이 통째로 제외
    return { scope: '시군 일부 구역', partial: true, matched: `${base} 중 ${hits.map((h) => h.name).join(', ')} 제외` };
  }
  return null;
}

const levelOf = (type) => (/경보$/.test(type) ? '경보' : /주의보$/.test(type) ? '주의보' : '');

/** t6 → 현장에 해당하는 발효 중 특보 [{ type, level, scope, partial, matched }] (경보 먼저) */
export function activeWarningsFor(t6, region) {
  const out = [];
  for (const line of String(t6 ?? '').split(/\r?\n/)) {
    const m = line.match(/^\s*o\s+(.+?)\s+:\s+(.+)$/);
    if (!m) continue;
    const hit = matchRegion(parseRegions(m[2]), region);
    if (hit) out.push({ type: m[1].trim(), level: levelOf(m[1]), ...hit });
  }
  return out.sort((a, b) => (a.level === '경보' ? 0 : 1) - (b.level === '경보' ? 0 : 1));
}

// ───────────── 통보문 이벤트 로그 → 현재 유효성 판정 ─────────────

const splitBlocks = (t) => String(t ?? '').split(/\r?\n(?=\s*\(\d+\))/);
const KO_TIME = /(\d{4})년\s*(\d+)월\s*(\d+)일\s*(\d+)시\s*(\d+)분/;
const stampOf = (m) => `${m[1]}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}${m[4].padStart(2, '0')}${m[5].padStart(2, '0')}`;
const ENDING_VERBS = new Set(['해제', '변경']); // "강풍경보 변경"은 경보가 끝나고 다른 등급으로 바뀐다는 뜻(새 등급은 별도 "발표" 항목)

/**
 * getWthrWrnMsg 항목들 → 이벤트 [{ type, verb, regionsText, effective('YYYYMMDDHHmm'), order, release }]
 *  t2: "(n) 한파주의보 발표 : 지역…"   t3: "(n) 한파주의보 발표 : 2026년 10월 27일 21시 00분"   t4: "(n) …\r\n  o 해제 예고: 28일 오전"
 */
export function parseEventLog(items) {
  const events = [];
  for (const it of items ?? []) {
    const times = new Map();
    for (const b of splitBlocks(it.t3)) {
      const n = b.match(/^\s*\((\d+)\)/)?.[1];
      const t = b.match(KO_TIME);
      if (n && t) times.set(n, stampOf(t));
    }
    const releases = new Map();
    for (const b of splitBlocks(it.t4)) {
      const n = b.match(/^\s*\((\d+)\)/)?.[1];
      const r = b.match(/해제 예고:\s*([^\r\n]+)/)?.[1];
      if (n && r) releases.set(n, r.trim());
    }
    for (const b of splitBlocks(it.t2)) {
      const m = b.match(/^\s*\((\d+)\)\s*(.+?)\s+(\S+)\s*:\s*([\s\S]+)$/);
      if (!m) continue;
      const effective = times.get(m[1]);
      if (!effective) continue;
      events.push({
        type: m[2].trim(),
        verb: m[3],
        regionsText: m[4].replace(/\s+/g, ' ').trim(),
        effective,
        order: Number(it.tmFc) * 1000 + Number(it.tmSeq ?? 0),
        release: releases.get(m[1]) ?? null,
      });
    }
  }
  return events;
}

/**
 * 현장 지역에 대한 특보별 현재 상태. nowStamp = 'YYYYMMDDHHmm'(KST)
 *  in_effect: 발효 시각이 지났고 그 뒤 해제 이벤트가 아직 없음 (releaseAt: 해제가 이미 예정돼 있으면 그 시각)
 *  upcoming:  발표됐지만 발효 시각이 아직 오지 않음
 */
export function evaluateEvents(events, region, nowStamp) {
  const byType = new Map();
  for (const ev of events) {
    const hit = matchRegion(parseRegions(ev.regionsText), region);
    if (!hit) continue;
    if (!byType.has(ev.type)) byType.set(ev.type, []);
    byType.get(ev.type).push({ ...ev, hit });
  }
  const out = [];
  for (const [type, list] of byType) {
    list.sort((a, b) => a.effective.localeCompare(b.effective) || a.order - b.order);
    const past = list.filter((e) => e.effective <= nowStamp);
    const future = list.filter((e) => e.effective > nowStamp);
    const last = past[past.length - 1];
    const base = (e) => ({ type, level: levelOf(type), scope: e.hit.scope, partial: e.hit.partial, matched: e.hit.matched });
    if (last && !ENDING_VERBS.has(last.verb)) {
      const rel = future.find((e) => ENDING_VERBS.has(e.verb));
      out.push({ ...base(last), state: 'in_effect', since: last.effective, releaseAt: rel?.effective ?? null, releaseNotice: last.release });
    } else {
      const nxt = future.find((e) => !ENDING_VERBS.has(e.verb));
      if (nxt) out.push({ ...base(nxt), state: 'upcoming', startsAt: nxt.effective, releaseNotice: nxt.release });
    }
  }
  const rank = (x) => (x.state === 'in_effect' ? 0 : 2) + (x.level === '경보' ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b));
}

/** t7 → 현장에 해당하는 예비특보 [{ type, when, scope, partial, matched }] */
export function preliminaryFor(t7, region) {
  const out = [];
  let type = '';
  for (const line of String(t7 ?? '').split(/\r?\n/)) {
    const h = line.match(/^\s*\(\d+\)\s*(.+?)\s*$/);
    if (h) {
      type = h[1];
      continue;
    }
    const m = line.match(/^\s*o\s+(.+?)\s+:\s+(.+)$/);
    if (!m || !type) continue;
    const hit = matchRegion(parseRegions(m[2]), region);
    if (hit) out.push({ type, when: m[1].trim(), ...hit });
  }
  return out;
}
