import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, cpSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const script = path.join(repoRoot, 'scripts', 'deploy.sh');
const gitBashCandidates = [
  'C:/Program Files/Git/bin/bash.exe',
  'D:/Applications/Git/bin/bash.exe',
  'C:/Program Files (x86)/Git/bin/bash.exe',
];
const gitBash = gitBashCandidates.find(existsSync);
const bash = process.platform === 'win32' && gitBash ? gitBash : 'bash';

function scratchRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'cms-deploy-'));
  writeFileSync(path.join(dir, 'package.json'), '{"name":"scratch"}\n');
  writeFileSync(path.join(dir, '.vercelignore'), '.env\n.env.*\n');
  cpSync(script, path.join(dir, 'deploy.sh'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return dir;
}

function run(dir: string, args: string[]) {
  return spawnSync(bash, ['deploy.sh', ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: process.env.PATH, VERCEL_SCOPE: 'example-team', VERCEL_PROJECT: 'example-cms', CMS_PUBLIC_ORIGIN: 'https://cms.example.com' } });
}

describe('scripts/deploy.sh', () => {
  it('refuses unspecified deployment targets before invoking any provider', () => {
    const dir = scratchRepo();
    const result = spawnSync(bash, ['deploy.sh', '--dry-run', '--skip-gates'], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, VERCEL_SCOPE: '', VERCEL_PROJECT: '', CMS_PUBLIC_ORIGIN: '' },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/explicit/);
  });
  it('is a bash script that fails closed', () => {
    const text = readFileSync(script, 'utf8');
    expect(text.startsWith('#!/usr/bin/env bash')).toBe(true);
    expect(text).toContain('set -euo pipefail');
  });

  it('dry-run prints the full plan without invoking vercel', () => {
    const dir = scratchRepo();
    const result = run(dir, ['--dry-run', '--skip-gates']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/vercel deploy --prod --skip-domain/);
    expect(result.stdout).toMatch(/vercel promote/);
    expect(result.stdout).toMatch(/api\/health/);
    expect(result.stdout).toMatch(/vercel rollback/);
    expect(result.stdout).not.toMatch(/Error/);
  });

  it('refuses a dirty working tree', () => {
    const dir = scratchRepo();
    writeFileSync(path.join(dir, 'stray.txt'), 'x');
    execFileSync('git', ['add', 'stray.txt'], { cwd: dir });
    const result = run(dir, ['--dry-run', '--skip-gates']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/clean/);
  });

  it('refuses when .vercelignore does not exclude .env files', () => {
    const dir = scratchRepo();
    writeFileSync(path.join(dir, '.vercelignore'), 'node_modules\n');
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'loosen'], { cwd: dir });
    const result = run(dir, ['--dry-run', '--skip-gates']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/\.vercelignore/);
  });

  it.each([
    ['plain', 'https://cms-test-team.vercel.app', true, true],
    ['envelope', '{"status":"ok","deployment":{"url":"https://cms-test-team.vercel.app"}}', true, true],
    ['url envelope', '{"url":"https://cms-test-team.vercel.app"}', true, true],
    ['bad json', '{bad', true, false],
    ['error envelope', '{"status":"error","url":"https://cms-test-team.vercel.app"}', true, false],
    ['foreign origin', 'https://example.com', true, false],
    ['failed health', 'https://cms-test-team.vercel.app', false, false],
  ])('real execution with mocked CLI: %s', (_name, output, healthy, promotes) => {
    const dir = scratchRepo();
    const bin = path.join(dir, 'mock-bin'); mkdirSync(bin);
    const mocks = {
      vercel: '#!/usr/bin/env bash\ncase "$1" in\nwhoami|link) exit 0;;\ndeploy) printf "%s\\n" "$MOCK_DEPLOY_OUTPUT";;\npromote) printf "%s\\n" "$2" >> "$MOCK_PROMOTION_LOG";;\n*) exit 9;;\nesac\n',
      curl: '#!/usr/bin/env bash\nif [[ "$MOCK_HEALTH" == "yes" ]]; then printf \'{"ok":true,"db":true}\'; else exit 22; fi\n',
      sleep: '#!/usr/bin/env bash\nexit 0\n',
    };
    for (const [name, text] of Object.entries(mocks)) {
      writeFileSync(path.join(bin, name), text); chmodSync(path.join(bin, name), 0o755);
    }
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'mocks'], { cwd: dir });
    const log = path.join(dir, '.git', 'promoted.txt');
    const result = spawnSync(bash, ['-c', 'export PATH="$PWD/mock-bin:$PATH"; exec bash deploy.sh --skip-gates --yes'], {
      cwd: dir, encoding: 'utf8', timeout: 30000, env: { ...process.env,
        MOCK_DEPLOY_OUTPUT: String(output), MOCK_PROMOTION_LOG: log, MOCK_HEALTH: healthy ? 'yes' : 'no',
        VERCEL_SCOPE: 'example-team', VERCEL_PROJECT: 'example-cms', CMS_PUBLIC_ORIGIN: 'https://cms.example.com',
        VERCEL_AUTOMATION_BYPASS_SECRET: '' },
    });
    expect(result.status === 0, result.stderr).toBe(promotes);
    expect(existsSync(log)).toBe(promotes);
    if (promotes) expect(readFileSync(log, 'utf8').trim()).toBe('https://cms-test-team.vercel.app');
  }, 15000);
});
