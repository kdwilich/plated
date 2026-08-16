// `wrangler pages dev` refuses to run when pages_build_output_dir is set, but
// the deploy needs it, and Pages rejects --config so a separate dev config
// isn't an option. So the key is stripped for the dev session and put back.
//
// Restoring reliably matters: a stripped wrangler.toml looks like an
// intentional edit, gets committed, and breaks the Cloudflare Pages build.
// Two layers guard that:
//   1. restore on normal exit and on signals (a bare `finally` is skipped when
//      the process is killed)
//   2. a sidecar backup that self-heals on the next run, covering SIGKILL and
//      anything else that gives us no chance to clean up
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';

const toml = 'wrangler.toml';
const backup = '.wrangler/wrangler.toml.backup';
const KEY = /^pages_build_output_dir\s*=.*\n/m;

mkdirSync('.wrangler', { recursive: true });

// Self-heal: a previous run was killed outright and left the key stripped.
if (existsSync(backup) && !KEY.test(readFileSync(toml, 'utf8'))) {
	writeFileSync(toml, readFileSync(backup, 'utf8'));
	console.log('[dev-wrangler] restored pages_build_output_dir from a previous interrupted run');
}

const original = readFileSync(toml, 'utf8');
if (!KEY.test(original)) {
	console.warn(`[dev-wrangler] warning: no pages_build_output_dir in ${toml}; deploys need it.`);
}

let restored = false;
function restore() {
	if (restored) return;
	restored = true;
	writeFileSync(toml, original);
	rmSync(backup, { force: true });
}

writeFileSync(backup, original);
writeFileSync(toml, original.replace(KEY, ''));

process.on('exit', restore);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
	process.on(signal, () => {
		restore();
		process.exit(0);
	});
}

const child = spawn('npx', ['wrangler', 'pages', 'dev', '--', 'npm', 'run', 'dev'], {
	stdio: 'inherit'
});
child.on('exit', (code) => {
	restore();
	process.exit(code ?? 0);
});
