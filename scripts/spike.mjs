// Phase 0 spike: spawn `claude` the way FORGE will (prompt on stdin, API-key env stripped).
// usage: node scripts/spike.mjs <cwd> <outFile> <prompt> [claude args...]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [cwd, out, prompt, ...args] = process.argv.slice(2);
const env = { ...process.env };
delete env.ANTHROPIC_API_KEY;
delete env.ANTHROPIC_AUTH_TOKEN;
const exe = process.env.CLAUDE_EXE ?? 'claude';
const win = process.platform === 'win32';
const p = spawn(exe, ['-p', ...args], { cwd, env, shell: win, stdio: ['pipe', 'pipe', 'pipe'] });
let so = '', se = '';
p.stdout.on('data', (d) => (so += d));
p.stderr.on('data', (d) => (se += d));
p.on('close', (code) => {
  writeFileSync(out, so);
  console.log(`${out}: exit=${code} bytes=${so.length} stderr=${JSON.stringify(se.slice(0, 300))}`);
});
p.stdin.end(prompt);
