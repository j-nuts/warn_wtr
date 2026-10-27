// 도트 캐릭터(안전모 쓴 작업자) 스프라이트 생성. 채움색만 그리고 외곽선은 자동으로 입힌다.
// 한 칸 = 한 글자. '.' = 투명.
//   H 안전모  h 안전모 하이라이트  D 안전모 챙  s 피부  k 볼터치  e 눈/입(어두운색)
//   v 형광 조끼  y 반사띠  b 작업복 소매  p 바지  B 장화  n 팻말 테두리  w 팻말 바탕
//   g 초록  a 호박색  r 빨강  t 땀방울

export const PALETTE = {
  o: '#2b2438',
  H: '#ffc933',
  h: '#ffe589',
  D: '#e0a100',
  s: '#ffd9b8',
  k: '#ff9fa8',
  e: '#2b2438',
  v: '#ff7a1a',
  y: '#eef27a',
  b: '#4a78e0',
  p: '#3b4a82',
  B: '#6d4a2d',
  n: '#8a5a2b',
  w: '#ffffff',
  g: '#2fbf71',
  a: '#f2a100',
  r: '#e5484d',
  t: '#7fd3ff',
};

const W = 16;
const SIGN = {
  go: ['.gg.', 'g..g', 'g..g', 'g..g', '.gg.'],
  caution: ['.aa.', '.aa.', '.aa.', '....', '.aa.'],
  stop: ['r..r', '.rr.', '.rr.', '.rr.', 'r..r'],
  unknown: ['.aa.', 'a..a', '..a.', '....', '..a.'],
};

/** 길이 n 의 줄을 만들고 { 위치: 글자 } 를 덮어쓴다 */
function line(n, base, over = {}) {
  const a = Array(n).fill(base);
  for (const [i, c] of Object.entries(over)) a[Number(i)] = c;
  return a.join('');
}
const pad = (left, body) => '.'.repeat(left) + body + '.'.repeat(W - left - body.length);

function face(mode) {
  // 얼굴 폭 10칸(열 3~12). 위치는 얼굴 안쪽 0~9
  const eyes = line(10, 's', { 2: 'e', 7: 'e' });
  const cheeks = { 1: 'k', 8: 'k' };
  const mouth = {
    go: [line(10, 's', { ...cheeks, 3: 'e', 6: 'e' }), line(10, 's', { 4: 'e', 5: 'e' })], // 웃는 입
    caution: [line(10, 's', cheeks), line(10, 's', { 3: 'e', 4: 'e', 5: 'e', 6: 'e' })], // 일자 입
    stop: [line(10, 's', { ...cheeks, 4: 'e', 5: 'e' }), line(10, 's', { 3: 'e', 6: 'e' })], // 찡그린 입
    unknown: [line(10, 's', cheeks), line(10, 's', { 4: 'e', 5: 'e' })], // 'o' 입
  }[mode];
  return [pad(3, line(10, 's')), pad(3, eyes), pad(3, mouth[0]), pad(3, mouth[1]), pad(4, line(8, 's'))];
}

/** 원본 채움 격자(22행 x 16열) */
function fillGrid(mode) {
  const rows = [
    pad(4, 'HHHHHHHH'),
    pad(3, 'HHhhHHHHHH'),
    pad(3, 'HHHHHHHHHH'),
    pad(2, 'DDDDDDDDDDDD'),
    ...face(mode),
  ];
  const sign = SIGN[mode];
  const signRows = ['nnnnnn', ...sign.map((r) => 'n' + r.replace(/\./g, 'w') + 'n'), 'nnnnnn'];
  for (let i = 0; i < 7; i++) {
    const stripe = i === 5 ? 'y' : 'v';
    const base = '.' + 'bb' + line(10, stripe) + 'bb' + '.';
    const r = base.split('');
    for (let c = 0; c < 6; c++) r[5 + c] = signRows[i][c];
    if (i === 3) {
      r[3] = 's';
      r[12] = 's'; // 팻말을 잡은 손
    }
    rows.push(r.join(''));
  }
  rows.push(pad(4, 'pppppppp'), pad(4, 'pppppppp'), pad(4, 'ppp..ppp'.replace(/\./g, '.')), pad(4, 'ppp..ppp'));
  rows.push(pad(3, 'BBBB..BBBB'), pad(3, 'BBBB..BBBB'));
  if (mode === 'caution') {
    // 땀방울
    for (const r of [5, 6]) rows[r] = rows[r].slice(0, 14) + 't' + rows[r].slice(15);
  }
  return rows;
}

/** 외곽선을 입힌 최종 격자(24행 x 18열: 사방 1칸 여백) */
export function buildSprite(mode) {
  const fill = fillGrid(mode);
  const h = fill.length;
  const grid = Array.from({ length: h + 2 }, () => Array(W + 2).fill('.'));
  fill.forEach((row, y) => [...row].forEach((c, x) => (grid[y + 1][x + 1] = c)));
  const out = grid.map((r) => [...r]);
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      if (grid[y][x] !== '.') continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (grid[y + dy]?.[x + dx] ?? '.') !== '.');
      if (near) out[y][x] = 'o';
    }
  }
  return out.map((r) => r.join(''));
}

/** 같은 색이 가로로 이어진 칸을 합쳐 rect 목록으로: [{ x, y, w, color }] */
export function spriteRects(mode) {
  const rects = [];
  buildSprite(mode).forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      if (c === '.') {
        x++;
        continue;
      }
      let w = 1;
      while (row[x + w] === c) w++;
      rects.push({ x, y, w, color: PALETTE[c] });
      x += w;
    }
  });
  return rects;
}

export const SPRITE_SIZE = { w: W + 2, h: 24 };
