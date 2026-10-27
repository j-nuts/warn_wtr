import { NextResponse } from 'next/server';
import { reverseRegion, KakaoError } from '../../../lib/kakao.js';
import { getWarningsFor } from '../../../lib/kma.js';

export const dynamic = 'force-dynamic';

// GET /api/warnings?lat=&lon=   (좌표 → 카카오로 행정구역 변환 후 판정)
// 통보문은 정시 단위로 갱신되므로 CDN에 짧게 캐시해 공공데이터 호출 한도를 아낀다.
const CACHE = { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60' };

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const lat = Number(sp.get('lat'));
  const lon = Number(sp.get('lon'));
  if (!sp.get('lat') || !sp.get('lon') || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: '좌표(lat, lon)가 올바르지 않습니다' }, { status: 400 });
  }
  const kakaoKey = String(process.env.KAKAO_REST_API_KEY || '').trim();
  if (!kakaoKey) {
    return NextResponse.json({ status: 'no_key', note: '좌표 → 행정구역 변환에 필요한 KAKAO_REST_API_KEY가 서버에 설정되지 않았습니다.' });
  }
  try {
    const region = await reverseRegion(lat.toFixed(5), lon.toFixed(5), kakaoKey);
    if (!region) {
      return NextResponse.json({ status: 'error', note: '해당 좌표의 행정구역을 찾지 못했습니다(국내 좌표인지 확인).' });
    }
    const result = await getWarningsFor({ key: process.env.KMA_SERVICE_KEY, region });
    return NextResponse.json(result, { headers: result.status === 'ok' ? CACHE : { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof KakaoError) return NextResponse.json({ status: 'error', note: `행정구역 변환 실패 — ${e.message}` });
    console.error('[warnings] unexpected error:', e?.message);
    return NextResponse.json({ error: '서버 내부 오류' }, { status: 500 });
  }
}
