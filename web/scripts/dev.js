const path = require('path');
const { spawnSync } = require('child_process');

// This machine sits behind a TLS-inspecting corporate proxy (Cloudflare Gateway),
// so Node can't verify certs for outbound requests (e.g. proxy.ts -> Supabase).
// The proxy's root CA is trusted by Windows but not Node's bundled CA store,
// and Next's dev server fetch doesn't honor NODE_EXTRA_CA_CERTS, so we relax
// verification for local dev only. Never do this for build/start/production.
process.env.NODE_EXTRA_CA_CERTS = path.join(__dirname, '..', 'certs', 'cloudflare-gateway-ca.pem');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const result = spawnSync('npx', ['next', 'dev'], {
  stdio: 'inherit',
  shell: true,
  cwd: path.join(__dirname, '..'),
  env: process.env,
});

process.exit(result.status ?? 0);
