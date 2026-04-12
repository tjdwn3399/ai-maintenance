import { list } from '@vercel/blob';

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
        manualContext = `\n\n[현장 업로드 매뉴얼 - ${manData.count}개 파일]\n${manData.combinedText}`;
      }
    }
  } catch (e) {
    console.error('매뉴얼 로드 실패:', e.message);
  }

  const alarmStr = alarm ? `알람코드: ${alarm}` : '알람코드: 없음 (증상 기반 분석)';

  const userQuery = `NC/PLC 시스템: ${SYS_LABEL[sys] || sys}
${alarmStr}
설비 유형: ${equip}
증상 상세: ${sym || '미입력'}${feedbackContext || ''}${manualContext}`;

  // ════════════════════════════════════════════════════
  // 1단계: 자유 형식 깊이 분석 (GPT/Gemini와 동일한 방식)
  // ════════════════════════════════════════════════════

  const EXPERT_SYSTEM = `당신은 현대자동차 아산엔진공장 설비관리부 수석 정비 전문가입니다.
20년 이상의 현장 경험을 바탕으로 설비 고장을 진단합니다.

전문 지식:
- SINUMERIK 840D/840Dsl 전체 알람 체계 (SV/NC/HMI/SINAMICS)
  · SV 계열: 서보모터, 드라이브, 엔코더, 볼스크류 관련
  · NC 계열: CNC 제어기, 프로그램, 보간 관련
  · SINAMICS: F07011(과전류), F07900(DC링크과전압), A07010(I²t경보)
  · 주요 파라미터: MD36200(속도제한), MD32200(위치루프게인), MD1600(I²t임계값)
- FANUC 0i/30i/31i 전체 알람 체계 (SV/PS/OT/SP/AL/SRVO/PMC)
  · SV0410(I²t과부하), SV0430(과속도), SV0431(과전류), SV0432(위치편차과대)
  · SV0435(엔코더통신오류), AL1000(ATC이상), SP0740(스핀들과부하)
  · 주요 파라미터: 1825(속도루프게인), 1826(속도루프적분), 1851(위치루프게인), 2086(I²t부하율)
- 미쓰비시 MELDAS/M800 알람 (E/S/M/Z 계열)
  · E10(과전류), E11(과속도), E13(엔코더이상), E30/E31(위치편차과대), E40(I²t과부하)
  · 파라미터: SV001(최대이송속도), SV003(속도루프게인), SV024(인포지션폭)
- 서보/드라이브 시스템: SINAMICS S120, SIMODRIVE 611, FANUC αi/βi 계열
- 설비보전 이론: 욕조곡선, MTTR/MTBF, PM/PdM/CBM, 고장물리학
- 기계 요소: 베어링 열화 4단계, 볼스크류 수명/윤활, LM가이드 예압, 스핀들 진단
  · 베어링 BPFO/BPFI 특성주파수, 진동속도 10mm/s↑ 교체 기준
  · 볼스크류 백래시 0.05mm↑ 점검, 3개월마다 LG2 계열 윤활
- 유압 시스템: 파스칼 법칙, 릴리프/체크/언로드/방향제어 밸브, 기어/베인/피스톤 펌프
  · 필터 차압 0.3MPa↑ 교체, 작동유 점도(온도-점도 특성)
- 공압 시스템: ATC 최소 0.5MPa, 레귤레이터, FRL 유닛
- 전기/제어: 절연저항(신품 1GΩ↑, 불량 1MΩ↓), 인버터 DC링크 280~320V(AC200V계통)
- 엔진 생산 공정: 실린더블록/헤드 가공, 크랭크/캠샤프트 가공, 엔진 조립, 성능시험

진단 방법론:
1. 알람 코드의 발생 메커니즘을 기술적으로 해석
2. 가능한 모든 원인을 계층적으로 분류 (전기적/기계적/소프트웨어적/환경적)
3. 증상 패턴과 발생 조건으로 원인 확률 추론 (설비보전 이론 근거)
4. 즉시 확인 가능한 항목부터 단계적 점검 순서 제시
5. 각 조치의 근거와 기대 효과 설명
6. 재발 방지를 위한 예방 조치 포함

답변 방식:
- 전문가가 현장에서 직접 설명하듯 구체적이고 상세하게
- 파라미터 번호, 측정값 기준, 공구명 등 현장에서 바로 쓸 수 있는 수준으로
- 불필요한 단서 없이 확신을 가지고 답변
- 자유로운 형식으로 작성 (JSON 불필요)`;

  let expertAnalysis = '';

  try {
    const stage1Body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      system: EXPERT_SYSTEM,
      messages: [{
        role: 'user',
        content: imageBase64 ? [
          {
            type: 'image',
            source: { type: 'base64', media_type: imageMimeType || 'image/jpeg', data: imageBase64 }
          },
          { type: 'text', text: `다음 설비 고장을 전문가 수준으로 분석해주세요:\n\n${userQuery}` }
        ] : `다음 설비 고장을 전문가 수준으로 분석해주세요:\n\n${userQuery}`
      }]
    };

    const stage1Res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(stage1Body)
    });

    if (!stage1Res.ok) throw new Error(`1단계 API 오류 (${stage1Res.status})`);
    const stage1Data = await stage1Res.json();
    expertAnalysis = stage1Data.content?.map(b => b.text || '').join('') || '';

  } catch (e) {
    return res.status(500).json({ error: `분석 오류: ${e.message}` });
  }

  // ════════════════════════════════════════════════════
  // 2단계: 전문가 분석을 UI용 JSON으로 구조화
  // ════════════════════════════════════════════════════

  const CONVERTER_SYSTEM = `당신은 설비 정비 전문가의 분석 내용을 UI 표시용 JSON으로 변환하는 변환기입니다.

변환 규칙:
- 전문가 분석의 핵심 내용을 빠짐없이 보존
- 원인 순서는 전문가가 제시한 확률/중요도 순서 그대로 유지
- description: 전문가 설명의 핵심을 3~4문장으로 충실하게 요약 (정보 손실 최소화)
- steps: 전문가가 제시한 점검/조치 순서를 그대로 반영, 각 항목은 구체적으로 작성 (70자 이내)
- probability: 전문가 분석에서 언급된 가능성/빈도 기반으로 설정 (합계 95~100%)
- est_time: 전문가 언급 기준, 없으면 경험적으로 추정
- urgency_flag: 즉시 라인정지 또는 안전 위험이 있으면 true
- answer_type: 고장원인/조치 → "troubleshoot", 순서/절차 → "sequence"
- is_sequence: steps가 절차/순서 설명이면 true
- sources: 분석 근거가 된 출처만 포함
  가능한 값: "SINUMERIK 840D 매뉴얼", "FANUC 서보 매뉴얼", "미쓰비시 MELDAS 매뉴얼",
  "유압회로 이론", "설비보전 이론", "기계요소 이론", "전기제어 이론",
  "현장 업로드 매뉴얼", "피드백 이력 DB"

출력: 순수 JSON만. 마크다운/코드블록/설명 절대 금지.

JSON 구조:
{"summary":"3~4문장 핵심 요약","urgency_flag":false,"urgency_msg":"","answer_type":"troubleshoot","solutions":[{"rank":1,"title":"원인명(18자이내)","probability":60,"description":"3~4문장 상세 설명","is_sequence":false,"steps":["구체적 조치1","구체적 조치2","구체적 조치3","구체적 조치4","구체적 조치5"],"tags":["키워드1","키워드2","키워드3"],"sources":["출처1","출처2"],"est_time":"복구시간"},{"rank":2,"title":"원인명","probability":25,"description":"설명","is_sequence":false,"steps":["조치1","조치2","조치3","조치4"],"tags":["키워드1","키워드2"],"sources":["출처1"],"est_time":"시간"},{"rank":3,"title":"원인명","probability":15,"description":"설명","is_sequence":false,"steps":["조치1","조치2","조치3"],"tags":["키워드1"],"sources":["출처1"],"est_time":"시간"}],"recommended_parts":[{"name":"부품명","code":"부품코드/파라미터","in_stock":true}]}`;

  try {
    const stage2Res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: CONVERTER_SYSTEM,
        messages: [{
          role: 'user',
          content: `다음 전문가 분석을 JSON으로 변환하세요.\n\n[원본 질문]\n${userQuery}\n\n[전문가 분석]\n${expertAnalysis}`
        }]
      })
    });

    if (!stage2Res.ok) throw new Error(`2단계 API 오류 (${stage2Res.status})`);
    const stage2Data = await stage2Res.json();
    const raw = stage2Data.content?.map(b => b.text || '').join('') || '';

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

    // 전문가 분석 원문도 함께 전달 (멀티턴 대화에서 활용)
    json._expertAnalysis = expertAnalysis;

    res.status(200).json(json);

  } catch (e) {
    // 2단계 실패 시 1단계 원문을 간단 파싱으로 폴백
    res.status(500).json({ error: e.message });
  }
}
