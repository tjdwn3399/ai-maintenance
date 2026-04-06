export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { alarm, equip, sys, sym, feedbackContext } = req.body;

  const SYS_LABEL = {
    siemens: 'SINUMERIK 840D (지멘스)',
    fanuc: 'FANUC 0i/30i',
    mitsubishi: '미쓰비시 MELDAS/M800',
    common: '공통/기타'
  };

  const PROMPT = `당신은 현대자동차 아산엔진공장 설비관리부 AI 정비 전문가입니다.
전문 영역: SINUMERIK 840D·FANUC 0i/30i·미쓰비시 MELDAS NC알람, 유압/공압 회로, 서보드라이브, 베어링/볼스크류/LM가이드, 설비보전이론(PM/PdM/CBM).
규칙: 유효한 JSON만 출력. 마크다운/코드블록 절대 금지. steps 각 항목 40자 이내. description 2문장 이내.
과거 피드백 데이터가 제공된 경우, 실제 정답이었던 원인을 높은 확률로 우선 배치하세요.
JSON 구조: {"summary":"요약","urgency_flag":false,"urgency_msg":"","solutions":[{"rank":1,"title":"원인명","probability":60,"description":"설명","steps":["단계1","단계2","단계3","단계4"],"tags":["태그1","태그2"],"est_time":"시간"},{"rank":2,"title":"원인명","probability":25,"description":"설명","steps":["단계1","단계2","단계3"],"tags":["태그1"],"est_time":"시간"},{"rank":3,"title":"원인명","probability":15,"description":"설명","steps":["단계1","단계2"],"tags":["태그1"],"est_time":"시간"}],"recommended_parts":[{"name":"부품명","code":"코드","in_stock":true}]}`;

  const alarmStr = alarm ? `알람코드: ${alarm}` : '알람코드: 없음 (증상 기반 분석)';

  const userContent = `NC/PLC: ${SYS_LABEL[sys] || sys}
${alarmStr}
설비: ${equip}
증상: ${sym || '미입력'}${feedbackContext || ''}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: PROMPT,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: `Anthropic API 오류: ${response.status}`, detail: errText });
    }

    const data = await response.json();
    const raw = data.content?.map(b => b.text || '').join('') || '';

    let json;
    try {
      json = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try { json = JSON.parse(m[0]); }
        catch { return res.status(500).json({ error: '파싱실패', raw: raw.slice(0, 500) }); }
      } else {
        return res.status(500).json({ error: '파싱실패', raw: raw.slice(0, 500) });
      }
    }

    res.status(200).json(json);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
