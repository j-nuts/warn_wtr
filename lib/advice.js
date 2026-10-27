// 특보 판정 결과 → 건설·건축 현장 작업 안내 (순수 함수)
//   go      작업 가능      : 발효 중·발효 예정 특보 없음
//   caution 주의해서 작업  : 발효 예정 특보, 또는 작업 영향이 제한적인 특보(한파·폭염·건조 등) 발효 중, 일부 구역 해당
//   stop    작업 비추천    : 강풍·호우·대설·태풍 등 작업 중지급 특보 발효 중, 또는 경보 발효 중
//   unknown 판정 불가      : 조회 실패 — "작업 가능"으로 간주하지 않는다
// 특보 "유무"만으로 내린 안내이며, 실제 기온·풍속 확인과 작업 중지 판단은 현장 안전관리자의 몫이다.

const STOP_RE = /강풍|호우|대설|태풍|지진해일|폭풍해일/;

const TIPS = [
  [/강풍/, '고소작업·크레인·비계 작업 중지, 자재·가설물 결속 확인'],
  [/호우/, '굴착·토공·전기 작업 중지, 배수로·법면 점검'],
  [/대설/, '지붕·고소작업 중지, 미끄럼 방지·적설 하중 점검'],
  [/태풍/, '전 작업 중지, 자재·가설물 고정 후 철수'],
  [/한파/, '콘크리트 타설·도장·방수 곤란, 동결·보온 대비, 방한 장비'],
  [/폭염/, '정기 휴식(시간당 10분)·물·그늘 확보, 한낮 옥외작업 단축'],
  [/건조/, '화기·용접 작업 불티 비산 방지, 소화기 비치'],
  [/황사|미세먼지/, '마스크 착용, 도장·외부 마감 작업 주의'],
  [/안개/, '시야 불량 — 장비·차량 유도 인원 배치'],
];

const tipOf = (type) => TIPS.find(([re]) => re.test(type))?.[1] ?? '해당 특보 내용을 확인하고 작업 계획을 조정';

const hhmm = (s) => (/^\d{12}/.test(String(s ?? '')) ? `${s.slice(8, 10)}:${s.slice(10, 12)}` : '');

const TITLE = {
  go: '오늘은 작업 가능해요!',
  caution: '작업은 하되 조심해요!',
  stop: '오늘은 작업 비추천!',
  unknown: '판정할 수 없어요',
};

/** w: /api/warnings 응답. 반환: { level, title, reasons: string[], tips: string[] } */
export function adviseWork(w) {
  if (!w || w.status !== 'ok') {
    return {
      level: 'unknown',
      title: TITLE.unknown,
      reasons: [w?.note || w?.message || w?.error || '특보 정보를 가져오지 못했습니다.'],
      tips: ['"작업 가능"으로 간주하지 말고 기상청 발표를 직접 확인하세요.'],
    };
  }

  let level = 'go';
  const reasons = [];
  const tips = new Set();
  const raise = (to) => {
    const rank = { go: 0, caution: 1, stop: 2 };
    if (rank[to] > rank[level]) level = to;
  };

  for (const it of w.active) {
    const stopClass = STOP_RE.test(it.type) || it.level === '경보';
    const partial = it.partial ? ' (일부 구역 대상 — 현장 해당 여부 확인)' : '';
    if (it.state === 'in_effect') {
      raise(stopClass ? 'stop' : 'caution');
      const until = it.releaseAt ? `, ${hhmm(it.releaseAt)} 해제 예정` : '';
      reasons.push(`${it.type} 발효 중${until}${partial}`);
      tips.add(tipOf(it.type));
    } else {
      raise('caution');
      reasons.push(`${hhmm(it.startsAt)}부터 ${it.type} 발효 예정${partial}`);
      tips.add(stopClass ? `${tipOf(it.type)} — 발효 전에 작업 마무리` : tipOf(it.type));
    }
  }
  for (const it of w.preliminary ?? []) {
    if (STOP_RE.test(it.type)) raise('caution');
    reasons.push(`${it.type} (${it.when})`);
  }

  if (level === 'go') {
    reasons.unshift('이 지역에 발효 중이거나 발효 예정인 육상 특보가 없어요');
    tips.add('실제 기온·풍속·노면 상태는 현장에서 한 번 더 확인하세요');
  }
  return { level, title: TITLE[level], reasons, tips: [...tips] };
}
