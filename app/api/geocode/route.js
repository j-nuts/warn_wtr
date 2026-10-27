import { NextResponse } from 'next/server';
import { geocode, KakaoError } from '../../../lib/kakao.js';

export const dynamic = 'force-dynamic';

// Netlify CDN은 기본적으로 쿼리스트링을 무시하고 캐시하므로 Netlify-Vary 로 쿼리별 캐시를 강제한다.
const CACHE = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800', 'Netlify-Vary': 'query' };

const HTTP ={ auth: 502, quota: 429, param: 400, network: 502, upstream: 502 };

export async function GET(request) {
  const key = String(process.env.KAKAO_REST_API_KEY || '').trim();
  if (!key) {
    return NextResponse.json({ status: 'no_key', message: '주소 검색 API 연결 필요 — 서버에 KAKAO_REST_API_KEY가 설정되지 않았습니다.' });
  }
  try {
    const q = new URL(request.url).searchParams.get('q');
    const results = await geocode(q, key);
    return NextResponse.json({ status: 'ok', results }, { headers: CACHE });
  } catch (e) {
    if (e instanceof KakaoError) return NextResponse.json({ error: e.message, kind: e.kind }, { status: HTTP[e.kind] ?? 502 });
    console.error('[geocode] unexpected error:', e?.message);
    return NextResponse.json({ error: '서버 내부 오류' }, { status: 500 });
  }
}
