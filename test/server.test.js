import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createAppServer } from '../server.js';

let server;
let port;

/** fetch()는 '..'를 미리 정규화하므로, 경로를 그대로 보내기 위해 http.request를 쓴다. */
function send(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('정적 파일 서버', () => {
  before(async () => {
    server = createAppServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  test('/ 는 index.html을 돌려준다', async () => {
    const res = await send('/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /^text\/html/);
    assert.match(res.body, /<title>할 일<\/title>/);
  });

  test('JS 모듈을 올바른 MIME 타입으로 제공한다', async () => {
    const res = await send('/js/app.js?v=1');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /^text\/javascript/);
  });

  test('없는 파일은 404', async () => {
    assert.equal((await send('/nope.txt')).status, 404);
    assert.equal((await send('/js')).status, 404);
  });

  test('public 밖의 파일은 읽을 수 없다', async () => {
    for (const path of ['/../server.js', '/..%2fserver.js', '/js/..%2f..%2fpackage.json', '/%2e%2e/package.json']) {
      const res = await send(path);
      assert.ok([403, 404].includes(res.status), `${path} → ${res.status}`);
      assert.doesNotMatch(res.body, /createAppServer|"scripts"/);
    }
  });

  test('잘못된 인코딩과 널 문자는 400', async () => {
    assert.equal((await send('/%E0%A4%A')).status, 400);
    assert.equal((await send('/index.html%00.js')).status, 400);
  });

  test('GET/HEAD 외의 메서드는 405', async () => {
    const res = await send('/', 'POST');
    assert.equal(res.status, 405);
    assert.equal(res.headers.allow, 'GET, HEAD');
  });

  test('HEAD는 본문 없이 헤더만 보낸다', async () => {
    const res = await send('/', 'HEAD');
    assert.equal(res.status, 200);
    assert.equal(res.body, '');
    assert.ok(Number(res.headers['content-length']) > 0);
  });
});
