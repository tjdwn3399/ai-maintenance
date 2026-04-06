import { list } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const { blobs } = await list({ prefix: 'manuals/' });
    const metaBlobs = blobs.filter(b => b.pathname.endsWith('.meta.json'));

    // 각 메타파일에서 텍스트 읽기
    const manuals = [];
    for (const blob of metaBlobs) {
      try {
        const response = await fetch(blob.url);
        const meta = await response.json();
        manuals.push({
          filename: meta.filename,
          uploadedAt: meta.uploadedAt,
          textLength: meta.textLength,
          text: meta.text,
          pathname: blob.pathname
        });
      } catch (e) {
        console.error('메타 읽기 실패:', blob.pathname, e.message);
      }
    }

    // 분석용 통합 텍스트 (총 30000자 제한)
    let combinedText = '';
    for (const m of manuals) {
      const chunk = `\n\n===== 매뉴얼: ${m.filename} =====\n${m.text}`;
      if ((combinedText + chunk).length > 30000) break;
      combinedText += chunk;
    }

    return res.status(200).json({
      count: manuals.length,
      manuals: manuals.map(m => ({
        filename: m.filename,
        uploadedAt: m.uploadedAt,
        textLength: m.textLength,
        pathname: m.pathname
      })),
      combinedText: combinedText.trim()
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
