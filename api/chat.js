export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { messages, context, alarm, equip, sys } = req.body;

  const SYS_LABEL = {
    siemens: 'SINUMERIK 840D (지멘스)',
    fanuc: 'FANUC 0i/30i/31i',
    mitsubishi: '미쓰비시 MELDAS/M800',
    common: '공통/기타'
  };

  const SYSTEM_PROMPT = `당신은 현대자동차 아산엔진공장 설비관리부 AI 정비 전문가입니다.
전문 영역: SINUMERIK 840D·FANUC 0i/30i·미쓰비시 MELDAS NC알람, 유압/공압 회로, 서보드라이브, 베어링/볼스크류/LM가이드, 설비보전이론.

현재 대화 컨텍스트:
- NC/PLC 시스템: ${SYS_LABEL[sys] || '공통'}
- 설비 유형: ${equip || '미지정'}
- 알람 코드: ${alarm || '없음'}
${context ? `\n[이전 분석 결과]\n${context}` : ''}

응답 원칙:
- 이전 분석 맥락을 기억하고 연속성 있게 답변
- 추가 조치, 상세 설명, 관련 파라미터 등 구체적으로 답변
- 한국어로 답변, 핵심은 굵게(**텍스트**)
- 단계별 설명이 필요하면 번호(1. 2. 3.) 형식 사용
- 답변은 간결하게 (300자 이내 권장, 복잡한 경우 500자 이내)`;

  try {
    // 최근 10턴으로 제한
    const safeMessages = (messages || []).slice(-10);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: safeMessages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: `API 오류 (${response.status})` });
    }

    const data = await response.json();
    const reply = data.content?.map(b => b.text || '').join('') || '';
    res.status(200).json({ reply });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
