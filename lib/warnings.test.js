import test from 'node:test';
import assert from 'node:assert/strict';
import { normSido, sigunguBase, parseRegions, matchRegion, activeWarningsFor, preliminaryFor } from './warnings.js';

const T6 = 'o 강풍경보 : 제주도(서귀포시중산간)\r\no 강풍주의보 : 서해5도, 충청남도(태안, 당진, 보령(도서제외)), 제주도(서귀포시중산간 제외), 인천(옹진, 인천영종), 울릉도.독도\r\no 한파주의보 : 경기도(가평, 군포, 여주동남부), 충청북도, 경상북도(영덕, 포항, 경주중북부, 경주동부 제외), 대전, 광주';
const T7 = '(1) 풍랑 예비특보\r\no 10월 27일 오후(12시~18시) : 동해남부앞바다\r\n(2) 강풍 예비특보\r\no 10월 27일 밤(18시~24시) : 경상북도(영덕, 포항, 울진평지, 경주동부), 울산';

test('시도/시군 정규화', () => {
  assert.equal(normSido('충청남도'), '충청남도');
  assert.equal(normSido('충남'), '충청남도');
  assert.equal(normSido('전북특별자치도'), '전북자치도');
  assert.equal(normSido('서울특별시'), '서울');
  assert.equal(normSido('제주특별자치도'), '제주도');
  assert.equal(sigunguBase('수원시 장안구'), '수원');
  assert.equal(sigunguBase('가평군'), '가평');
});

test('괄호 중첩/제외 표기 해석', () => {
  const e = parseRegions('충청남도(태안, 보령(도서제외)), 제주도(서귀포시중산간 제외), 대전');
  assert.equal(e[0].names.length, 2);
  assert.equal(e[0].names[1].partial, true);
  assert.equal(e[1].exclude, true);
  assert.equal(e[2].whole, true);
});

test('시군 지정 / 시도 전체 / 제외 매칭', () => {
  const w = (sido, sigungu) => activeWarningsFor(T6, { sido, sigungu }).map((x) => x.type);
  assert.deepEqual(w('경기도', '가평군'), ['한파주의보']);
  assert.deepEqual(w('경기도', '수원시 장안구'), []);
  assert.deepEqual(w('충청북도', '청주시 상당구'), ['한파주의보']);
  assert.deepEqual(w('대전광역시', '서구'), ['한파주의보']);
  assert.deepEqual(w('서울특별시', '강남구'), []);
  assert.deepEqual(w('경상북도', '포항시 남구'), ['한파주의보'].slice(1)); // 포항 통째로 제외
  assert.deepEqual(w('제주특별자치도', '제주시'), ['강풍주의보']); // 서귀포시중산간만 제외
  assert.deepEqual(w('제주특별자치도', '서귀포시'), ['강풍경보', '강풍주의보']); // 경보 먼저, 둘 다 일부 구역
  assert.deepEqual(w('경상북도', '울릉군'), ['강풍주의보', '한파주의보']); // 한파는 경북 전체에서 일부만 제외
});

test('일부 구역만 해당하면 partial', () => {
  const r = activeWarningsFor(T6, { sido: '경기도', sigungu: '여주시' });
  assert.equal(r[0].partial, true);
  const b = activeWarningsFor(T6, { sido: '충청남도', sigungu: '보령시' });
  assert.equal(b[0].partial, true);
  const g = activeWarningsFor(T6, { sido: '경상북도', sigungu: '경주시' });
  assert.equal(g[0].partial, true);
});

test('예비특보', () => {
  const p = preliminaryFor(T7, { sido: '경상북도', sigungu: '포항시 북구' });
  assert.equal(p.length, 1);
  assert.equal(p[0].type, '강풍 예비특보');
  assert.match(p[0].when, /밤/);
  assert.equal(preliminaryFor(T7, { sido: '울산광역시', sigungu: '남구' }).length, 1);
  assert.equal(preliminaryFor(T7, { sido: '서울특별시', sigungu: '중구' }).length, 0);
});



import { parseEventLog, evaluateEvents } from './warnings.js';

const msg = (tmFc, tmSeq, t2, t3, t4 = '') => ({ tmFc, tmSeq, t2, t3, t4 });
const LOG = [
  msg(202610271100, 172, '(1) 한파주의보 발표 : 경기도(가평, 군포), 대전', '(1) 한파주의보 발표 : 2026년 10월 27일 21시 00분', '(1) 한파주의보 발표\r\n  o 해제 예고: 28일 오전(09시~12시)'),
  msg(202610270500, 167, '(1) 강풍주의보 발표 : 인천(옹진)\r\n(2) 강풍주의보 발표 : 충청남도(태안)', '(1) 강풍주의보 발표 : 2026년 10월 27일 05시 00분\r\n(2) 강풍주의보 발표 : 2026년 10월 27일 18시 00분'),
  msg(202610271500, 176, '(1) 강풍주의보 해제 : 인천(옹진)', '(1) 강풍주의보 해제 : 2026년 10월 27일 22시 00분'),
  msg(202610262200, 164, '(1) 강풍경보 변경 : 제주도(서귀포시중산간)', '(1) 강풍경보 변경 : 2026년 10월 26일 23시 00분'),
];

test('이벤트 로그: 발효 전이면 upcoming, 지난 뒤면 in_effect', () => {
  const ev = parseEventLog(LOG);
  assert.equal(ev.length, 5);
  const r = (region, now) => evaluateEvents(ev, region, now).map((x) => `${x.type}:${x.state}`);
  assert.deepEqual(r({ sido: '경기도', sigungu: '가평군' }, '202610271502'), ['한파주의보:upcoming']);
  assert.deepEqual(r({ sido: '경기도', sigungu: '가평군' }, '202610272100'), ['한파주의보:in_effect']);
  assert.deepEqual(r({ sido: '서울특별시', sigungu: '중구' }, '202610271502'), []);
});

test('이벤트 로그: 발효 중 + 해제 예정, 해제 후, 발효 예정 시각', () => {
  const ev = parseEventLog(LOG);
  const a = evaluateEvents(ev, { sido: '인천광역시', sigungu: '옹진군' }, '202610271502')[0];
  assert.equal(a.state, 'in_effect');
  assert.equal(a.releaseAt, '202610272200');
  assert.deepEqual(evaluateEvents(ev, { sido: '인천광역시', sigungu: '옹진군' }, '202610272200'), []);
  const c = evaluateEvents(ev, { sido: '충청남도', sigungu: '태안군' }, '202610271502')[0];
  assert.equal(c.state, 'upcoming');
  assert.equal(c.startsAt, '202610271800');
  const h = evaluateEvents(ev, { sido: '경기도', sigungu: '가평군' }, '202610271502')[0];
  assert.equal(h.releaseNotice, '28일 오전(09시~12시)');
});

test('경보 변경은 해당 경보 종료로 본다', () => {
  const ev = parseEventLog(LOG);
  assert.deepEqual(evaluateEvents(ev, { sido: '제주특별자치도', sigungu: '서귀포시' }, '202610271502'), []);
});

test('전남광주통합특별시 표기: 구는 광주, 시·군은 전라남도로 매칭', () => {
  const T6 = 'o 한파주의보 : 전라남도(담양, 나주동남부, 나주서북부), 대전, 광주';
  const w = (sido, sigungu) => activeWarningsFor(T6, { sido, sigungu }).length;
  assert.equal(w('전남광주통합특별시', '북구'), 1);   // 광주 전체
  assert.equal(w('전남광주통합특별시', '나주시'), 1); // 전라남도 나주(일부 구역)
  assert.equal(w('전남광주통합특별시', '목포시'), 0); // 전라남도지만 목록에 없음
  assert.equal(activeWarningsFor(T6, { sido: '전남광주통합특별시', sigungu: '나주시' })[0].partial, true);
});
