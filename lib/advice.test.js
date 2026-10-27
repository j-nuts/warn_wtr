import test from 'node:test';
import assert from 'node:assert/strict';
import { adviseWork } from './advice.js';

const ok = (active = [], preliminary = []) => ({ status: 'ok', verdict: 'none', active, preliminary });

test('특보 없음 → 작업 가능', () => {
  const a = adviseWork(ok());
  assert.equal(a.level, 'go');
  assert.match(a.reasons[0], /특보가 없어요/);
});

test('강풍주의보 발효 중 → 작업 비추천 (고소작업 안내)', () => {
  const a = adviseWork(ok([{ type: '강풍주의보', level: '주의보', state: 'in_effect', since: '202610271340', releaseAt: null }]));
  assert.equal(a.level, 'stop');
  assert.ok(a.tips.some((t) => /고소작업/.test(t)));
});

test('한파주의보 발효 중 → 주의 (비추천 아님), 발효 예정도 주의', () => {
  assert.equal(adviseWork(ok([{ type: '한파주의보', level: '주의보', state: 'in_effect' }])).level, 'caution');
  const up = adviseWork(ok([{ type: '한파주의보', level: '주의보', state: 'upcoming', startsAt: '202610272100' }]));
  assert.equal(up.level, 'caution');
  assert.match(up.reasons[0], /21:00부터 한파주의보 발효 예정/);
});

test('중지급 특보가 발효 예정이면 주의 + 발효 전 마무리 안내', () => {
  const a = adviseWork(ok([{ type: '호우주의보', level: '주의보', state: 'upcoming', startsAt: '202610271800' }]));
  assert.equal(a.level, 'caution');
  assert.ok(a.tips.some((t) => /발효 전에 작업 마무리/.test(t)));
});

test('경보가 발효 중이면 종류와 무관하게 비추천, 가장 높은 단계가 이긴다', () => {
  assert.equal(adviseWork(ok([{ type: '폭염경보', level: '경보', state: 'in_effect' }])).level, 'stop');
  const mix = adviseWork(ok([{ type: '한파주의보', level: '주의보', state: 'in_effect' }, { type: '강풍주의보', level: '주의보', state: 'in_effect' }]));
  assert.equal(mix.level, 'stop');
});

test('예비특보(중지급)만 있으면 주의', () => {
  assert.equal(adviseWork(ok([], [{ type: '강풍 예비특보', when: '10월 27일 밤' }])).level, 'caution');
});

test('조회 실패는 작업 가능으로 간주하지 않는다', () => {
  assert.equal(adviseWork({ status: 'error', note: '조회 실패' }).level, 'unknown');
  assert.equal(adviseWork(null).level, 'unknown');
  assert.equal(adviseWork({ status: 'no_key', note: 'x' }).level, 'unknown');
});
