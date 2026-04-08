export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { id, pw } = req.body;

  // 환경변수 또는 기본값
  const validId = process.env.LOGIN_ID || 'asan';
  const validPw = process.env.LOGIN_PW || 'asan';

  if (id === validId && pw === validPw) {
    // 간단한 토큰 생성 (현재 날짜 기반)
    const token = Buffer.from(`${validId}:${Date.now()}`).toString('base64');
    return res.status(200).json({ ok: true, token });
  }

  return res.status(401).json({ ok: false, message: '아이디 또는 비밀번호가 틀렸습니다.' });
}
