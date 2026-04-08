export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { image, mimeType } = req.body;
  if (!image) return res.status(400).json({ error: '이미지 데이터 없음' });

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
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType || 'image/jpeg',
                data: image
              }
            },
            {
              type: 'text',
              text: `당신은 현대자동차 아산엔진공장 설비관리 전문가입니다.
이 이미지를 분석하여 설비 이상 증상이나 알람 정보를 추출해주세요.

다음 정보가 있으면 추출해주세요:
1. 알람 코드 (예: SV444, AL1000 등)
2. 에러 메시지 텍스트
3. 화면에 표시된 수치나 파라미터
4. 육안으로 보이는 이상 증상 (연기, 누유, 파손, 변색 등)
5. 설비 상태 (정지, 경보 중, 비정상 동작 등)

응답 형식: 발견한 내용을 간결하게 한국어로 서술해주세요. 없는 정보는 언급하지 마세요.
이미지에서 설비 관련 내용이 없으면 "설비 이상 정보를 찾을 수 없습니다."라고 답하세요.`
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: `API 오류 (${response.status})` });
    }

    const data = await response.json();
    const result = data.content?.map(b => b.text || '').join('') || '';
    res.status(200).json({ result });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
