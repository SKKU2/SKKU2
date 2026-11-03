// 변경분을 커밋하고 GitHub(origin)로 푸시한다.
//   node scripts/sync.mjs          한 번 실행 (Claude Code Stop 훅이 호출)
//   node scripts/sync.mjs --watch  파일 저장을 감시해 15초 뒤 자동 반영 (직접 수정할 때)
// .gitignore에 있는 node_modules·.env·.localdata 등은 올라가지 않는다.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = process.env.LOCALAPPDATA || '';
const GIT = [process.env.GIT_EXE, path.join(LOCAL, 'devtools', 'mingit', 'cmd', 'git.exe')].find(p => p && fs.existsSync(p)) || 'git';
const ghDir = path.join(LOCAL, 'devtools', 'gh');
const env = { ...process.env };
// gh 자격 증명 도우미가 gh.exe를 찾을 수 있게 PATH에 추가
if (fs.existsSync(ghDir)) {
  const found = fs.readdirSync(ghDir, { recursive: true }).find(f => String(f).endsWith('gh.exe'));
  if (found) env.Path = path.dirname(path.join(ghDir, String(found))) + path.delimiter + (env.Path || env.PATH || '');
}

const git = args => execFileSync(GIT, args, { cwd: ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function sync() {
  if (!git(['status', '--porcelain'])) return 'no-change';
  git(['add', '-A']);
  const files = git(['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  if (!files.length) return 'no-change';
  const msg = `자동 동기화: ${files.length}개 파일 (${files.slice(0, 3).join(', ')}${files.length > 3 ? ' 외' : ''})`;
  git(['commit', '-q', '-m', msg]);
  git(['push', '-q']);
  return `pushed ${files.length} file(s)`;
}

function run() {
  try {
    const r = sync();
    if (r !== 'no-change') console.log(JSON.stringify({ systemMessage: `GitHub 자동 반영: ${r}` }));
  } catch (e) {
    const m = String(e.stderr || e.message || e).trim().split('\n').slice(-2).join(' ');
    console.log(JSON.stringify({ systemMessage: `GitHub 자동 반영 실패: ${m}` }));
  }
}

if (process.argv.includes('--watch')) {
  const IGNORE = /(^|[\\/])(node_modules|\.next|\.git|\.localdata|\.vercel|coverage)([\\/]|$)/;
  let timer = null;
  console.log(`감시 중: ${ROOT} (Ctrl+C로 종료)`);
  fs.watch(ROOT, { recursive: true }, (_e, file) => {
    if (!file || IGNORE.test(String(file))) return;
    clearTimeout(timer);
    timer = setTimeout(run, 15000);
  });
} else {
  run();
}
