export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { alarm, equip, sys, sym, feedbackContext, imageBase64, imageMimeType } = req.body;

  const SYS_LABEL = {
    siemens: 'SINUMERIK 840D/840Dsl (지멘스)',
    fanuc: 'FANUC Series 0i/30i/31i/32i',
    mitsubishi: '미쓰비시 MELDAS/M800/M80',
    common: '공통/기타'
  };

  // 업로드된 매뉴얼 텍스트 가져오기
  let manualContext = '';
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    const manRes = await fetch(`${baseUrl}/api/manuals`);
    if (manRes.ok) {
      const manData = await manRes.json();
      if (manData.combinedText) {
        manualContext = `\n\n━━━ 현장 업로드 매뉴얼 참조 (${manData.count}개 파일) ━━━\n${manData.combinedText}`;
      }
    }
  } catch (e) {
    console.error('매뉴얼 로드 실패:', e.message);
  }

  const SYSTEM_PROMPT = `당신은 현대자동차 아산엔진공장 설비관리부 수석 AI 정비 전문가입니다. 아래의 전문 지식을 바탕으로 정확한 트러블슈팅 분석을 수행합니다.

━━━ SINUMERIK 840D/840Dsl 알람 지식 ━━━
[SV 계열 - 서보/드라이브 알람]
• SV410/25410: 모터 I²t 과부하. 원인: 연속 과부하로 인한 모터 열적 한계 초과, 냉각팬 고장, 주변온도 과다. 조치: 모터 냉각팬 확인, MD1600 I2T_THRESHOLD 확인, 가공조건 검토.
• SV444/25444: 속도제어기 출력 포화. 원인: 기계적 구속(볼스크류·LM가이드 마찰), 드라이브 전류한계 설정 부적절, 엔코더 이상. 조치: 축 수동 이동 저항 확인, MD1401 MOTOR_MAX_CURRENT 확인, 볼스크류 윤활.
• SV436/25436: 위치 편차 과대(Contour Error). 원인: 서보 게인 불량, 기계적 부하 과다, 엔코더 케이블 노이즈. 조치: MD36400 CONTOUR_TOL 확인, 드라이브 최적화, 케이블 점검.
• SV380/25380: 이송 과속도. 원인: 프로그램 이송속도 오류, MD32000 MAX_AX_VELO 설정 오류.
• SV456: 드라이브 레디 신호 없음. 조치: SIMODRIVE/SINAMICS 전원 모듈 점검.
• NC700: 비상정지 활성화. 조치: DB10.DBX56.1 비상정지 신호 확인.
• NC16900: 원점 미복귀. 조치: 원점복귀 실행.
• SINAMICS F07011: 모터 과전류. SINAMICS F07900: DC링크 과전압.
• 파라미터: MD36200 AX_VELO_LIMIT, MD32200 POSCTRL_GAIN, MD1001 MOTOR_TYPE.

━━━ FANUC 0i/30i/31i 알람 지식 ━━━
• SV0401: 서보 준비 안됨. 조치: 앰프 LED 확인, FSSB 케이블 점검.
• SV0410: 서보 I²t 과부하. 조치: 파라미터 2086 부하율 확인, 볼스크류 윤활.
• SV0430: 서보 과속도. 조치: 엔코더 케이블 점검, 파라미터 1825 확인.
• SV0431: 서보 과전류. 조치: 절연저항 측정(500V 메가, 1MΩ 이상).
• SV0432: 위치편차 과대. 조치: 파라미터 1825(속도루프), 1851(위치루프) 확인.
• SV0435: 엔코더 통신 오류(FSSB). 조치: 케이블 육안 점검, 커넥터 재결선.
• SV0443: 서보 앰프 과열. 조치: 앰프 냉각팬 확인, 필터 청소.
• PS0090: 참조점 복귀 미완료. 조치: 원점복귀 후 가공.
• OT0500~0507: 오버트래블. 조치: 파라미터 1320/1321 확인.
• SP0740: 스핀들 과부하. 조치: 절삭조건 감소, 베어링 확인.
• AL1000: ATC 이상. 조치: 공기압(0.5MPa↑) 확인, 그리퍼 센서 점검.
• SRVO-018: 서보 축 오버로드. SRVO-023: 정지거리 초과.
• 핵심 파라미터: 1825(속도루프게인), 1826(적분), 1851(위치루프게인), 2086(I²t부하율).

━━━ 미쓰비시 MELDAS/M800 알람 지식 ━━━
• E10: 서보 과전류. 조치: 절연저항 측정, 드라이브 교체 검토.
• E11: 서보 과속도. 조치: SV003(속도게인), SV047(엔코더) 확인.
• E13: 엔코더 이상. 조치: 케이블 점검.
• E30/E31: 위치편차 과대. 조치: SV024(인포지션), SV003 확인.
• E40: 과부하(I²t). 조치: SV026/SV027 확인.
• S01: 비상정지. S51: 원점복귀 필요.
• M7021: 유압 압력 저하. 조치: 게이지·필터 점검.
• Z70: G코드 오류. Z71: 프로그램 형식 오류.

━━━ 유압·공압 보전 이론 ━━━
• 압력 저하 원인: 펌프 마모, 내부 누설(씰 마모), 필터 막힘(차압 0.3MPa↑→교체), 릴리프 밸브 불량.
• 압력 과다: 릴리프 밸브 고착, 언로드 밸브 불량.
• 점검 순서: 게이지→필터 차압→릴리프 밸브→펌프 토출압→내부 누설.
• ATC 공압: 최소 0.5MPa 필요. 0.4MPa 이하→그리퍼 동작 불량.

━━━ 기계 요소 보전 이론 ━━━
• 베어링 열화 4단계: 1(초기결함,고주파)→2(진동증가)→3(소음발생)→4(온도급상승,즉시교체).
• 교체 기준: 진동속도 10mm/s↑, 온도 70°C↑, 주기적 충격음.
• 볼스크류: 백래시 0.05mm↑, 이송 중 진동, 마찰음 시 점검. 윤활: 3개월마다 LG2계열.
• LM가이드: 직선 이송 중 주기적 진동, 사이드 유격 증가 시 점검.

━━━ 전기·제어 진단 ━━━
• 절연저항: 신품 1GΩ↑, 주의 1~10MΩ, 불량 1MΩ↓ (500V 메가테스터).
• 인버터 과열: 방열핀 오염, 팬 고장, 주변온도 40°C↑.
• DC링크 정상전압: AC200V 계통→DC280~320V.
• 엔코더 배터리: 3V↓→즉시 교체(데이터 손실 위험).

━━━ 분석 원칙 ━━━
1. 알람의 기술적 발생 메커니즘 먼저 파악
2. 설비 유형+증상을 복합 추론 (단순 매칭 금지)
3. 현장 업로드 매뉴얼 내용이 있으면 최우선 참조
4. 과거 피드백 데이터가 있으면 반드시 우선 반영
5. 조치는 현장에서 즉시 수행 가능하게 구체적으로

응답 규칙:
- 유효한 JSON만 출력. 마크다운/코드블록/설명문 절대 금지.
- 문자열 내 큰따옴표는 반드시 이스케이프(\\").
- steps 각 항목 45자 이내. description 2~3문장 이내.
- 확률 합계 100% 근접.
- answer_type 필드: 질문이 고장 원인/조치 요청이면 "troubleshoot", 점검순서/시퀀스/절차 요청이면 "sequence"로 설정.
- is_sequence 필드: answer_type이 "sequence"이거나 해당 원인의 steps가 순서/절차 설명이면 true로 설정.
- sources 필드: 해당 원인 판단의 근거 출처를 배열로 명시. 가능한 값: "SINUMERIK 840D 매뉴얼", "FANUC 서보 매뉴얼", "미쓰비시 MELDAS 매뉴얼", "유압회로 이론", "설비보전 이론", "현장 업로드 매뉴얼: [파일명]", "피드백 이력 DB". 실제 참조한 출처만 포함.

JSON 구조 (반드시 준수):
{"summary":"2~3문장 요약","urgency_flag":false,"urgency_msg":"","answer_type":"troubleshoot","solutions":[{"rank":1,"title":"원인명(15자이내)","probability":60,"description":"기술적 근거 포함 설명","is_sequence":false,"steps":["단계1","단계2","단계3","단계4"],"tags":["태그1","태그2","태그3"],"sources":["출처1","출처2"],"est_time":"예상복구시간"},{"rank":2,"title":"원인명","probability":25,"description":"설명","steps":["단계1","단계2","단계3"],"tags":["태그1","태그2"],"sources":["출처1"],"est_time":"시간"},{"rank":3,"title":"원인명","probability":15,"description":"설명","steps":["단계1","단계2"],"tags":["태그1"],"sources":["출처1"],"est_time":"시간"}],"recommended_parts":[{"name":"부품명","code":"부품코드또는파라미터","in_stock":true}]}`;

  const alarmStr = alarm ? `알람코드: ${alarm}` : '알람코드: 없음 (증상 기반 분석)';

  const userContent = `NC/PLC 시스템: ${SYS_LABEL[sys] || sys}
${alarmStr}
설비 유형: ${equip}
증상 상세: ${sym || '미입력'}${feedbackContext || ''}${manualContext}`;

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
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: imageBase64 ? [
            {
              type: 'image',
              source: { type: 'base64', media_type: imageMimeType || 'image/jpeg', data: imageBase64 }
            },
            { type: 'text', text: userContent }
          ] : userContent
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: `API 오류 (${response.status})`, detail: errText });
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
        catch {
          let partial = m[0];
          const oa = (partial.match(/\[/g)||[]).length - (partial.match(/\]/g)||[]).length;
          const ob = (partial.match(/\{/g)||[]).length - (partial.match(/\}/g)||[]).length;
          for(let i=0;i<oa;i++) partial+=']';
          for(let i=0;i<ob;i++) partial+='}';
          try { json = JSON.parse(partial); }
          catch { return res.status(500).json({ error: '파싱실패', raw: raw.slice(0,300) }); }
        }
      } else {
        return res.status(500).json({ error: '파싱실패', raw: raw.slice(0,300) });
      }
    }

    res.status(200).json(json);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
