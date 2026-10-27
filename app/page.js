'use client';

import { useState } from 'react';
import WorkAdvisor from './WorkAdvisor.js';

const stamp = (s) => {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(String(s || ''));
  return m ? `${+m[2]}/${+m[3]} ${m[4]}:${m[5]}` : '';
};

async function getJson(path) {
  let res;
  try {
    res = await fetch(path);
  } catch {
    throw new Error('서버에 연결하지 못했습니다.');
  }
  let j = {};
  try {
    j = await res.json();
  } catch {}
  if (!res.ok) throw new Error(j.error || `서버 오류 (HTTP ${res.status})`);
  return j;
}

const HEAD = {
  in_effect: ['v-in_effect', '발효 중인 특보가 있습니다'],
  upcoming: ['v-upcoming', '발효 예정 특보가 있습니다'],
  none: ['v-none', '발효 중·발효 예정 특보 없음'],
};

function Result({ w, place }) {
  if (!w || w.status !== 'ok') {
    return (
      <>
        <p className="verdict v-err">판정 불가</p>
        <p className="sub">{w?.note || w?.message || w?.error || '조회하지 못했습니다.'}</p>
        <p className="note">&quot;특보 없음&quot;으로 간주하지 마세요.</p>
      </>
    );
  }
  const [cls, label] = HEAD[w.verdict];
  return (
    <>
      <p className={`verdict ${cls}`}>{label}</p>
      <p className="sub">
        {place} · 행정구역 {w.region.sido} {w.region.sigungu}
      </p>
      <p className="sub">
        판정 시각 {w.asOf.replace('T', ' ').replace('+09:00', ' KST')} · 최근 통보문 {stamp(w.announcedAt)}
      </p>
      {w.active.length > 0 && (
        <ul className="items">
          {w.active.map((it, i) => {
            const when =
              it.state === 'in_effect'
                ? it.since
                  ? `${stamp(it.since)} 발효`
                  : '발표 시각은 조회 범위(5일) 밖'
                : `${stamp(it.startsAt)} 발효 예정`;
            const rel = [it.releaseAt ? `${stamp(it.releaseAt)} 해제 예정` : '', it.releaseNotice ? `해제 예고: ${it.releaseNotice}` : '']
              .filter(Boolean)
              .join(' · ');
            return (
              <li key={`${it.type}-${i}`}>
                <span className={`tag t-${it.state}`}>{it.state === 'in_effect' ? '발효 중' : '발효 예정'}</span>
                <b>{it.type}</b>
                <div className="sub">
                  {when}
                  {rel ? ` · ${rel}` : ''}
                </div>
                {it.partial && <div className="sub">⚠ 시군 일부 구역({it.matched}) 대상 — 현장이 해당 구역인지 확인 필요</div>}
              </li>
            );
          })}
        </ul>
      )}
      {w.preliminary.length > 0 && (
        <>
          <p className="sub" style={{ marginTop: 12 }}>
            <b>예비특보</b> (아직 특보 아님)
          </p>
          <ul className="items">
            {w.preliminary.map((it, i) => (
              <li key={`p-${i}`}>
                <span className="tag t-pre">예비</span>
                <b>{it.type}</b>
                <div className="sub">
                  {it.when}
                  {it.partial ? ` · 일부 구역(${it.matched})` : ''}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="note">{w.note}</p>
    </>
  );
}

export default function Page() {
  const [q, setQ] = useState('');
  const [cands, setCands] = useState([]);
  const [busy, setBusy] = useState('');
  const [view, setView] = useState(null); // { message } | { w, place }

  async function check(lat, lon, place) {
    setCands([]);
    setBusy('특보 확인 중…');
    setView(null);
    try {
      setView({ w: await getJson(`/api/warnings?lat=${lat}&lon=${lon}`), place });
    } catch (e) {
      setView({ w: { status: 'error', note: e.message }, place });
    } finally {
      setBusy('');
    }
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    setCands([]);
    setView(null);
    setBusy('주소 검색 중…');
    try {
      const g = await getJson('/api/geocode?q=' + encodeURIComponent(q.trim()));
      if (g.status !== 'ok') {
        setBusy('');
        return setView({ w: { status: 'error', note: g.message || '주소 검색 API가 연결되지 않았습니다.' } });
      }
      if (!g.results.length) {
        setBusy('');
        return setView({ w: { status: 'error', note: '검색 결과가 없습니다. 주소를 더 구체적으로 입력해 보세요.' } });
      }
      if (g.results.length === 1) return check(g.results[0].lat, g.results[0].lon, g.results[0].address);
      setCands(g.results);
      setBusy('');
    } catch (e) {
      setBusy('');
      setView({ w: { status: 'error', note: e.message } });
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setView({ w: { status: 'error', note: '이 브라우저는 위치 정보를 지원하지 않습니다.' } });
    setBusy('현재 위치 확인 중…');
    setView(null);
    navigator.geolocation.getCurrentPosition(
      (p) => check(p.coords.latitude, p.coords.longitude, '현재 위치'),
      () => {
        setBusy('');
        setView({ w: { status: 'error', note: '위치 확인에 실패했습니다. 위치 권한을 허용하거나 주소를 직접 입력하세요.' } });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <main>
      <h1>현장 기상특보 판정</h1>

      <section className="card">
        <form onSubmit={onSubmit}>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="현장 주소 또는 건물·장소명" autoComplete="off" required />
          <button type="submit" disabled={!!busy}>
            조회
          </button>
        </form>
        <div className="row">
          <button type="button" className="ghost" onClick={useMyLocation} disabled={!!busy}>
            내 현재 위치로 조회
          </button>
        </div>
        {cands.length > 0 && (
          <ul className="cands">
            {cands.map((r, i) => (
              <li key={i}>
                <button type="button" onClick={() => check(r.lat, r.lon, r.address)}>
                  {r.name}
                  <small>{r.address}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(busy || view) && (
        <section className="card" aria-live="polite">
          {busy ? <p className="sub">{busy}</p> : <Result w={view.w} place={view.place} />}
        </section>
      )}

      {!busy && view && <WorkAdvisor w={view.w} />}
    </main>
  );
}
