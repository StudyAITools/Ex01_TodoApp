/**
 * public/ 폴더를 제공하는 의존성 없는 정적 파일 서버.
 * (브라우저는 file:// 로 연 페이지에서 ES 모듈을 불러오지 않으므로 로컬 서버가 필요하다.)
 *
 *   npm start                 → http://localhost:3000
 *   PORT=4000 npm start       → 다른 포트
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = resolve(fileURLToPath(new URL('./public', import.meta.url)));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * 요청 URL을 root 안의 파일 경로로 바꾼다.
 * @returns {string | null} root 밖을 가리키면(경로 탈출 시도) null
 * @throws {URIError} 잘못된 퍼센트 인코딩·널 문자
 */
export function resolveRequestPath(root, url) {
  let pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  if (pathname.includes('\0')) throw new URIError('null byte in path');
  if (pathname.endsWith('/')) pathname += 'index.html';
  const filePath = resolve(root, `.${pathname}`);
  return filePath.startsWith(root + sep) ? filePath : null;
}

function sendText(res, status, message, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(message);
}

export function createAppServer({ root = PUBLIC_DIR } = {}) {
  return createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
      return;
    }

    let filePath;
    try {
      filePath = resolveRequestPath(root, req.url);
    } catch {
      sendText(res, 400, 'Bad Request');
      return;
    }
    if (!filePath) {
      sendText(res, 403, 'Forbidden');
      return;
    }

    try {
      const body = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code)) {
        sendText(res, 404, 'Not Found');
      } else {
        console.error(error);
        sendText(res, 500, 'Internal Server Error');
      }
    }
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || 'localhost';
  const server = createAppServer();

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`포트 ${port}이(가) 이미 사용 중입니다. 다른 포트로 실행하세요: PORT=${port + 1} npm start`);
    } else {
      console.error(error);
    }
    process.exit(1);
  });

  server.listen(port, host, () => {
    console.log(`TODO 앱 실행 중 → http://${host}:${port}  (종료: Ctrl+C)`);
  });
}
