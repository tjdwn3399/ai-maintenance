export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { messages, context, expertAnalysis, alarm, equip, sys } = req.body;

  const SYS_LABEL = {
    siemens: 'SINUMERIK 840D (지멘스)',
    fanuc: 'FANUC 0i/30i/31i',
    mitsubishi: '미쓰비시 MELDAS/M800',
    common: '공통/기타'
  };

  const SYSTEM_PROMPT = `당신은 현대자동차 아산엔진공장 설비관리부 수석 AI 정비 전문가입니다.
20년 이상의 현장 경험을 바탕으로 설비 고장을 진단하고 조치합니다.

현재 대화 컨텍스트:
- NC/PLC 시스템: ${SYS_LABEL[sys] || '공통'}
- 설비 유형: ${equip || '미지정'}
- 알람 코드: ${alarm || '없음'}

${expertAnalysis ? `[이전 분석 내용 - 이 맥락을 기억하고 연속성 있게 답변]\n${expertAnalysis}` : context ? `[분석 요약]\n${context}` : ''}

전문 지식:
- SINUMERIK 840D·FANUC 0i/30i·미쓰비시 MELDAS 전체 알람 체계
- 서보/드라이브/엔코더 진단, 파라미터 설정
- 유압·공압 회로, 베어링·볼스크류·LM가이드 기계요소
- 설비보전 이론(PM/PdM/CBM), 전기제어 진단

답변 원칙:
- 이전 분석 내용을 기억하고 맥락에 맞게 이어서 설명
- 추가 질문에 대해 더 깊이 있고 구체적으로 답변
- 파라미터 번호, 측정 기준값, 공구명 등 현장에서 바로 활용 가능한 수준
- 한국어로 답변, 단계별 설명 시 번호 형식 사용
- 간결하되 필요한 정보는 빠짐없이 포함`;

  try {
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
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: safeMessages
      })
    });

    if (!response.ok) {
      return res.status(500).json({ error: `API 오류 (${response.status})` });
    }

    const data = await response.json();
    const reply = data.content?.map(b => b.text || '').join('') || '';
    res.status(200).json({ reply });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
