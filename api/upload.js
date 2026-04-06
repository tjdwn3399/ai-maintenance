import { put, list, del } from '@vercel/blob';

export const config = {
  api: { bodyParser: false }
};

// Buffer로 raw body 읽기
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// multipart에서 파일 파트 추출
function extractFile(body, boundary) {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  let pos = 0;

  while (pos < body.length) {
    const bPos = body.indexOf(boundaryBuf, pos);
    if (bPos === -1) break;
    const lineEnd = body.indexOf(Buffer.from('\r\n\r\n'), bPos);
    if (lineEnd === -1) break;
    const header = body.slice(bPos + boundaryBuf.length + 2, lineEnd).toString();

    if (header.includes('filename=')) {
      const fnMatch = header.match(/filename="([^"]+)"/);
      const filename = fnMatch ? fnMatch[1] : 'unknown';
      const dataStart = lineEnd + 4;
      const nextBound = body.indexOf(boundaryBuf, dataStart);
      const dataEnd = nextBound === -1 ? body.length : nextBound - 2;
      return { filename, data: body.slice(dataStart, dataEnd) };
    }
    pos = bPos + boundaryBuf.length;
  }
  return null;
}

// ── 텍스트 추출 함수들 ──

async function extractPdf(buf) {
  try {
    const mod = await import('pdf-parse');
    const pdfParse = mod.default || mod;
    const result = await pdfParse(buf);
    return result.text || '';
  } catch (e) {
    // pdf-parse 실패 시 기본 텍스트 추출 시도
    const str = buf.toString('latin1');
    const texts = [];
    const re = /BT[\s\S]*?ET/g;
    let m;
    while ((m = re.exec(str)) !== null) {
      const inner = m[0].replace(/[^\x20-\x7E가-힣]/g, ' ');
      if (inner.trim().length > 3) texts.push(inner.trim());
    }
    return texts.join('\n') || `[PDF 추출 실패: ${e.message}]`;
  }
}

async function extractExcel(buf) {
  try {
    const mod = await import('xlsx');
    const XLSX = mod.default || mod;
    const wb = XLSX.read(buf, { type: 'buffer' });
    let text = '';
    for (const name of wb.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      text += `[시트: ${name}]\n${csv}\n\n`;
    }
    return text || '[Excel 내용 없음]';
  } catch (e) {
    return `[Excel 추출 실패: ${e.message}]`;
  }
}

async function extractPptx(buf) {
  try {
    // PPTX = ZIP → slide XML에서 텍스트 추출
    const { Uint8Array: UA } = globalThis;
    // JSZip 없이 직접 ZIP 파싱 (간단 버전)
    const str = buf.toString('utf8');
    // XML 텍스트 노드 추출
    const matches = str.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || [];
    const lines = matches.map(m => m.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    return lines.length ? lines.join('\n') : '[PPT 텍스트 없음]';
  } catch (e) {
    return `[PPT 추출 실패: ${e.message}]`;
  }
}

// ── 메인 핸들러 ──

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
      const body = await readBody(req);
      const { pathname } = JSON.parse(body.toString());
      await del(pathname);
      const orig = pathname.replace('.meta.json', '');
      try { await del(orig); } catch {}
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST: 파일 업로드
  if (req.method === 'POST') {
    try {
      const ct = req.headers['content-type'] || '';
      const bMatch = ct.match(/boundary=([^\s;]+)/);
      if (!bMatch) return res.status(400).json({ error: 'multipart boundary 없음' });

      const body = await readBody(req);
      const file = extractFile(body, bMatch[1]);
      if (!file) return res.status(400).json({ error: '파일을 찾을 수 없습니다' });

      const { filename, data } = file;
      const ext = filename.split('.').pop().toLowerCase();

      // 지원 형식 확인
      if (!['pdf','xlsx','xls','pptx','ppt'].includes(ext)) {
        return res.status(400).json({ error: `지원하지 않는 형식: ${ext}` });
      }

      // 크기 확인 (20MB)
      if (data.length > 20 * 1024 * 1024) {
        return res.status(400).json({ error: '20MB 초과' });
      }

      // 텍스트 추출
      let text = '';
      if (ext === 'pdf') {
        text = await extractPdf(data);
      } else if (['xlsx','xls'].includes(ext)) {
        text = await extractExcel(data);
      } else {
        text = await extractPptx(data);
      }

      // 50000자 제한
      if (text.length > 50000) text = text.slice(0, 50000) + '\n...[이하 생략]';

      const safe = filename.replace(/[^a-zA-Z0-9가-힣._-]/g, '_');
      const ts = Date.now();
      const blobPath = `manuals/${ts}_${safe}`;

      // Blob에 원본 + 메타 저장
      await put(blobPath, data, { access: 'public' });

      const meta = {
        filename,
        ext,
        uploadedAt: new Date().toISOString(),
        size: data.length,
        textLength: text.length,
        text
      };
      const metaPath = `manuals/${ts}_${safe.replace(/\.[^.]+$/, '')}.meta.json`;
      await put(metaPath, JSON.stringify(meta), {
        access: 'public',
        contentType: 'application/json'
      });

      return res.status(200).json({
        ok: true,
        filename,
        textLength: text.length,
        preview: text.slice(0, 300)
      });

    } catch (e) {
      console.error('Upload error:', e);
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
}
