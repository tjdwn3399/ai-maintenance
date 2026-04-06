import { put, list, del } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: 파일 목록
  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: 'manuals/' });
      const metas = blobs.filter(b => b.pathname.endsWith('.meta.json'));
      const manuals = [];
      for (const b of metas) {
        try {
          const r = await fetch(b.url);
          const meta = await r.json();
          manuals.push({
            filename: meta.filename,
            uploadedAt: meta.uploadedAt,
            textLength: meta.textLength,
            pathname: b.pathname
          });
        } catch {}
      }
      return res.status(200).json({ manuals });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // DELETE: 파일 삭제
  if (req.method === 'DELETE') {
    try {
      const { pathname } = req.body;
      if (!pathname) return res.status(400).json({ error: 'pathname 필요' });
      await del(pathname);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST: 텍스트 저장 (클라이언트에서 추출된 텍스트만 받음)
  if (req.method === 'POST') {
    try {
      const { filename, ext, text, size } = req.body;

      if (!filename || !text) {
        return res.status(400).json({ error: 'filename과 text가 필요합니다' });
      }

      // 텍스트 크기 제한 (50000자)
      const safeText = text.length > 50000
        ? text.slice(0, 50000) + '\n...[이하 생략]'
        : text;

      const safe = filename.replace(/[^a-zA-Z0-9가-힣._-]/g, '_');
      const ts = Date.now();
      const metaPath = `manuals/${ts}_${safe}.meta.json`;

      const meta = {
        filename,
        ext: ext || filename.split('.').pop(),
        uploadedAt: new Date().toISOString(),
        size: size || 0,
        textLength: safeText.length,
        text: safeText
      };

      await put(metaPath, JSON.stringify(meta), {
        access: 'public',
        contentType: 'application/json'
      });

      return res.status(200).json({
        ok: true,
        filename,
        textLength: safeText.length,
        preview: safeText.slice(0, 200)
      });

    } catch (e) {
      console.error('Upload error:', e);
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
}
