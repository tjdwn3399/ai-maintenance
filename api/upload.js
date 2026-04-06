import { put, list, del } from '@vercel/blob';

export const config = { api: { bodyParser: false } };

// 멀티파트 파싱 (의존성 없이 직접 구현)
async function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=(.+)$/);
      if (!boundaryMatch) return reject(new Error('No boundary'));

      const boundary = boundaryMatch[1];
      const parts = [];
      const boundaryBuf = Buffer.from(`--${boundary}`);

      let start = 0;
      while (start < body.length) {
        const bIdx = body.indexOf(boundaryBuf, start);
        if (bIdx === -1) break;
        const headerStart = bIdx + boundaryBuf.length + 2;
        const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), headerStart);
        if (headerEnd === -1) break;
        const header = body.slice(headerStart, headerEnd).toString();
        const dataStart = headerEnd + 4;
        const nextBoundary = body.indexOf(boundaryBuf, dataStart);
        const dataEnd = nextBoundary === -1 ? body.length : nextBoundary - 2;
        const data = body.slice(dataStart, dataEnd);

        const nameMatch = header.match(/name="([^"]+)"/);
        const filenameMatch = header.match(/filename="([^"]+)"/);
        if (nameMatch) {
          parts.push({
            name: nameMatch[1],
            filename: filenameMatch ? filenameMatch[1] : null,
            data,
            header
          });
        }
        start = bIdx + boundaryBuf.length;
      }
      resolve(parts);
    });
    req.on('error', reject);
  });
}

// PDF 텍스트 추출 (pdf-parse 사용)
async function extractPdfText(buffer) {
  try {
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const result = await pdfParse(buffer);
    return result.text || '';
  } catch (e) {
    console.error('PDF 추출 오류:', e.message);
    return `[PDF 텍스트 추출 실패: ${e.message}]`;
  }
}

// Excel 텍스트 추출 (xlsx 사용)
async function extractExcelText(buffer) {
  try {
    const XLSX = (await import('xlsx')).default;
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let text = '';
    workbook.SheetNames.forEach(name => {
      const sheet = workbook.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      text += `[시트: ${name}]\n${csv}\n\n`;
    });
    return text;
  } catch (e) {
    return `[Excel 추출 실패: ${e.message}]`;
  }
}

// PPT 텍스트 추출 (텍스트만 간단히 추출)
async function extractPptText(buffer) {
  try {
    // PPTX는 ZIP 구조 — 텍스트만 정규식으로 추출
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);
    let text = '';
    const slideFiles = Object.keys(zip.files)
      .filter(f => f.match(/ppt\/slides\/slide\d+\.xml/))
      .sort();

    for (const f of slideFiles) {
      const xml = await zip.files[f].async('text');
      // XML 태그 제거 후 텍스트만 추출
      const cleaned = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const slideNum = f.match(/slide(\d+)/)?.[1] || '?';
      text += `[슬라이드 ${slideNum}] ${cleaned}\n\n`;
    }
    return text || '[PPT 텍스트 없음]';
  } catch (e) {
    return `[PPT 추출 실패: ${e.message}]`;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 파일 목록 조회
  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: 'manuals/' });
      const manuals = blobs.map(b => ({
        name: b.pathname.replace('manuals/', '').replace('.meta.json', ''),
        url: b.url,
        size: b.size,
        uploadedAt: b.uploadedAt,
        pathname: b.pathname
      })).filter(b => b.pathname.endsWith('.meta.json'));
      return res.status(200).json({ manuals });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // 파일 삭제
  if (req.method === 'DELETE') {
    try {
      const { pathname } = req.body || {};
      if (!pathname) return res.status(400).json({ error: 'pathname 필요' });
      // 원본 파일 + 메타 파일 삭제
      await del(pathname);
      const metaPath = pathname.replace(/\.[^.]+$/, '.meta.json');
      try { await del(metaPath); } catch {}
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // 파일 업로드
  if (req.method === 'POST') {
    try {
      const parts = await parseMultipart(req);
      const filePart = parts.find(p => p.filename);
      if (!filePart) return res.status(400).json({ error: '파일 없음' });

      const filename = filePart.filename;
      const ext = filename.split('.').pop().toLowerCase();
      const buffer = filePart.data;

      // 텍스트 추출
      let extractedText = '';
      if (ext === 'pdf') {
        extractedText = await extractPdfText(buffer);
      } else if (ext === 'xlsx' || ext === 'xls') {
        extractedText = await extractExcelText(buffer);
      } else if (ext === 'pptx' || ext === 'ppt') {
        extractedText = await extractPptText(buffer);
      } else {
        return res.status(400).json({ error: '지원 형식: PDF, Excel, PPT' });
      }

      // 텍스트 크기 제한 (50000자)
      const truncated = extractedText.length > 50000
        ? extractedText.slice(0, 50000) + '\n...[이하 생략]'
        : extractedText;

      const safeFilename = filename.replace(/[^a-zA-Z0-9가-힣._-]/g, '_');
      const timestamp = Date.now();
      const blobPath = `manuals/${timestamp}_${safeFilename}`;

      // 원본 파일 저장
      await put(blobPath, buffer, { access: 'public' });

      // 메타데이터(추출 텍스트 포함) 저장
      const meta = {
        filename,
        ext,
        uploadedAt: new Date().toISOString(),
        size: buffer.length,
        textLength: truncated.length,
        text: truncated
      };
      await put(blobPath.replace(/\.[^.]+$/, '.meta.json'),
        JSON.stringify(meta), { access: 'public', contentType: 'application/json' });

      return res.status(200).json({
        ok: true,
        filename,
        textLength: truncated.length,
        preview: truncated.slice(0, 200)
      });
    } catch (e) {
      console.error('업로드 오류:', e);
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
}
