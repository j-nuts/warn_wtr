import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSprite, spriteRects, PALETTE, SPRITE_SIZE } from './sprite.js';

for (const mode of ['go', 'caution', 'stop', 'unknown']) {
  test(`스프라이트(${mode}): 모든 행 폭이 같고 정의된 색만 사용`, () => {
    const g = buildSprite(mode);
    assert.equal(g.length, SPRITE_SIZE.h);
    for (const row of g) assert.equal(row.length, SPRITE_SIZE.w, row);
    for (const c of g.join('')) assert.ok(c === '.' || PALETTE[c], `정의되지 않은 색 문자: ${c}`);
    assert.ok(spriteRects(mode).length > 20);
  });
}
