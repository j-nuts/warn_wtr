'use client';

import { adviseWork } from '../lib/advice.js';
import { spriteRects, SPRITE_SIZE } from '../lib/sprite.js';

function PixelWorker({ mode }) {
  const rects = spriteRects(mode);
  return (
    <svg
      className={`worker worker-${mode}`}
      viewBox={`0 0 ${SPRITE_SIZE.w} ${SPRITE_SIZE.h}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={{ go: '작업 가능 안내 캐릭터', caution: '주의 안내 캐릭터', stop: '작업 비추천 안내 캐릭터', unknown: '판정 불가 안내 캐릭터' }[mode]}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.color} />
      ))}
    </svg>
  );
}

export default function WorkAdvisor({ w }) {
  const a = adviseWork(w);
  return (
    <section className={`card advisor advisor-${a.level}`} aria-live="polite">
      <PixelWorker mode={a.level} />
      <div className="bubble">
        <p className="bubble-title">{a.title}</p>
        <ul className="bubble-list">
          {a.reasons.map((t, i) => (
            <li key={`r${i}`}>{t}</li>
          ))}
        </ul>
        {a.tips.length > 0 && (
          <>
            <p className="bubble-sub">현장 체크</p>
            <ul className="bubble-list tips">
              {a.tips.map((t, i) => (
                <li key={`t${i}`}>{t}</li>
              ))}
            </ul>
          </>
        )}
        <p className="note">특보 발표 여부만으로 낸 참고용 안내입니다. 작업 중지·재개 판단은 현장 안전관리자와 관련 기준을 따르세요.</p>
      </div>
    </section>
  );
}
