// Liveness of the reference application; model availability is deliberately not a health prerequisite.
const port = process.env.BAYONE_STAGE_PUBLIC_PORT || '28795';
if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw Error('Invalid health port');
try {
  const response = await fetch(`http://127.0.0.1:${port}/healthz`, {signal: AbortSignal.timeout(2000)});
  const body = await response.json();
  if (!response.ok || response.headers.get('X-BayOne-Staging') !== 'bayone-vm101-synthetic-staging-v1' ||
      body.ok !== true || body.chat !== 'ready' || body.media !== 'ready') throw Error('Unhealthy');
  console.log(JSON.stringify({service: 'bayone-vm101-staging', application: 'healthy', modelVerified: false, production: false}));
} catch {
  console.error('Bay One staging application is not healthy');
  process.exitCode = 1;
}
