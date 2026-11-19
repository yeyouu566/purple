import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import BMLogic from './bm-logic.js';
import { ClaudeError, analyzeWithClaude } from './claude.mjs';

const [index, logicScript] = await Promise.all([
  readFile(new URL('./index.html', import.meta.url)),
  readFile(new URL('./bm-logic.js', import.meta.url)),
]);
const publicQuestions = {
  scaleLabels: BMLogic.SCALE_LABELS,
  areas: BMLogic.AREAS.map(({ key, name, question, items }) => ({ key, name, question, items })),
};
const maxBodyBytes = 16_384;

function json(response, status, data, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers,
  });
  response.end(JSON.stringify(data));
}

async function readPayload(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= maxBodyBytes) chunks.push(chunk);
  }
  if (size > maxBodyBytes) throw new ClaudeError(413, '요청이 너무 커요.');

  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!payload?.info || typeof payload.info !== 'object' || Array.isArray(payload.info)) throw new Error();
    const info = {};
    for (const [field, limit] of Object.entries({ idea: 80, customer: 80, comp: 100 })) {
      const value = payload.info[field] ?? '';
      if (typeof value !== 'string' || value.length > limit) throw new Error();
      info[field] = value.trim();
    }
    if (!info.idea) throw new Error();
    BMLogic.validateAnswers(payload.answers);
    return { info, answers: payload.answers };
  } catch {
    throw new ClaudeError(400, '사업 아이디어와 20개 문항의 답변을 확인해 주세요.');
  }
}

const server = createServer({ requestTimeout: 30_000 }, async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const pathname = request.url.split('?')[0];
  if (pathname === '/' || pathname === '/index.html') {
    if (request.method !== 'GET') return json(response, 405, { error: 'GET 요청만 지원해요.' }, { Allow: 'GET' });
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(index);
  }
  if (pathname === '/bm-logic.js') {
    if (request.method !== 'GET') return json(response, 405, { error: 'GET 요청만 지원해요.' }, { Allow: 'GET' });
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    return response.end(logicScript);
  }
  if (pathname === '/api/questions') {
    if (request.method !== 'GET') return json(response, 405, { error: 'GET 요청만 지원해요.' }, { Allow: 'GET' });
    return json(response, 200, publicQuestions);
  }
  if (pathname !== '/api/analysis' && pathname !== '/api/report') {
    return json(response, 404, { error: '페이지를 찾을 수 없어요.' });
  }
  if (request.method !== 'POST') return json(response, 405, { error: 'POST 요청만 지원해요.' }, { Allow: 'POST' });
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return json(response, 415, { error: 'JSON 형식으로 요청해 주세요.' });
  }

  const controller = new AbortController();
  const cancel = () => controller.abort();
  response.once('close', cancel);
  let report;
  try {
    const { info, answers } = await readPayload(request);
    if (response.destroyed) return;
    report = BMLogic.buildReport(info, answers);
    report.evidenceChecks = ['demand', 'diffImportance'].flatMap(key => {
      const [area, item] = BMLogic.EVIDENCE[key];
      return answers[area][item] < BMLogic.CONFIG.EVIDENCE_MIN
        ? [{ area: BMLogic.AREAS[area].name, item: BMLogic.AREAS[area].items[item] }]
        : [];
    });
    const analysis = await analyzeWithClaude({ data: BMLogic, report, answers, signal: controller.signal });
    if (!response.destroyed) json(response, 200, pathname === '/api/report' ? { ...report, analysis } : analysis);
  } catch (error) {
    if (response.destroyed) return;
    if (error instanceof ClaudeError) {
      const result = report && pathname === '/api/report'
        ? { ...report, analysisError: error.message }
        : { error: error.message };
      return json(response, error.status, result);
    }
    console.error('BM 자가진단 분석 실패', error.name);
    json(response, 500, { error: '분석 요청을 처리하는 중 문제가 생겼어요.' });
  } finally {
    response.off('close', cancel);
  }
});

server.listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () => {
  console.log('BM 자가진단 · http://localhost:' + server.address().port);
});
