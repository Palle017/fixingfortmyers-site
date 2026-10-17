# VM101: isolated Bay One runtime qualification

**Status, 2026-10-17:** implemented and tested locally; not installed on VM101. This package runs the existing public repository's Node reference service with synthetic state. It is not an export of the separately hosted Bay One application, and it is not a production cutover.

Read [the migration assessment](../../docs/BAYONE-VM101-MIGRATION-2026-10-17.md) for recovered source revisions, production boundaries, data preservation, and remaining access requirements. The existing [booking contract](../../docs/BOOKING-CONTRACT-V1.md) and [rollout runbook](../../docs/BOOKING-ROLLOUT-RUNBOOK.md) continue to govern booking work.

## What this installs

| Setting | Concrete value |
| --- | --- |
| Supervisor | Native Ubuntu systemd; no container daemon required |
| Unit / account | `bayone-vm101-staging.service` / `bayone-stage`, no interactive shell |
| Interpreter | Operator-supplied, verified Node 24 executable, copied to a dedicated path |
| Application | Existing `_website-intake/server.mjs` and `public-chat.mjs`, wrapped by `staging.mjs` |
| API / private inbox | `127.0.0.1:28795` / `127.0.0.1:28798` |
| State | `/var/lib/bayone-vm101-staging`, mode 0700; synthetic marker required |
| Configuration | `/etc/bayone-vm101-staging/staging.env`, mode 0600 |
| Versioned code | `/opt/bayone-vm101-staging/releases/<git-sha>`; atomic `current` symlink |
| Runtime receipts | `REVISION`, file `SHA256SUMS`, `NODE_VERSION`, `NODE_SHA256` |
| Model | Disabled by default; optional explicitly selected Ollama model through loopback |
| Notifications / external systems | Disabled; no customer texts, Beside webhook, Zoho, Owner sync or booking writes |
| Resource starting limits | JS heap 256 MiB; systemd MemoryHigh 320 MiB, MemoryMax 384 MiB, TasksMax 64 |
| Recovery | Restart on failure after five seconds, limited to five starts per minute |
| Logs | Dedicated journal namespace; persistent limit 32 MiB, runtime 16 MiB, retention seven days |

These resource values are starting limits for a small API qualification service. They are not measurements of VM101's capacity. The reported 1 GiB guest must be freshly inventoried before installation; model weights and inference are excluded from this budget.

The service binds only loopback, accepts only its loopback browser origins, has no elevated capabilities, and restricts network traffic to localhost. A purpose-specific response header identifies it as staging. It refuses an unmarked nonempty data directory and state containing symlinks. This matters because the reference chat runtime performs retention cleanup at startup: **never attach a customer database to this staging service**.

## 1. Verify the existing guest, then prepare a clean release

Use an already authorized SSH route into **VM101**, not the Proxmox host shell. Verify the current DHCP lease, account, authorized key, host key and sudo rights first. Do not create broad new keys or change another VM to make installation convenient.

Read-only guest inventory:

```bash
hostnamectl
cat /etc/os-release
uname -m
nproc
free -h
df -h / /var /opt
ip -brief address
systemctl --failed --no-pager
ss -ltnp
command -v node
```

Confirm ports 28795/28798 are unused and that the staging paths/account/unit do not belong to an existing workload. If a prior installation is present, inspect its receipts before reusing it. Keep existing services and the baseline VM snapshot intact.

On a connected development machine, fetch this repository, select the reviewed migration commit, and run its required checks under Node 24:

```bash
npm ci
npm test
node tools/audit-accessibility.mjs
python3 -m unittest discover -s _website-intake/dashboard-sync -p 'test_*.py' -v
```

The checks rewrite routine `docs/evidence/*` files. Discard only those generated rewrites after inspecting the diff; do not discard unrelated changes. Transfer a **clean committed checkout** to the guest. The installer uses an explicit runtime file allowlist and compares each installed file to that commit. It copies no tests, private backend source, customer data, or `runtime.json`.

Supply an Ubuntu-compatible **Node 24 executable** obtained through a verified distribution source or an existing trusted installation. Verify the distribution checksum/signature and architecture before running it, following the [official Node binary verification instructions](https://github.com/nodejs/node#verifying-binaries). Do not assume Ubuntu's default Node package meets this requirement. The installer checks the major version, `node:sqlite` and the SQLite backup API; it records the executable hash and does not replace system Node.

## 2. Install only synthetic staging

Replace the two paths below with the actual clean checkout and verified Node binary. These are required inputs, not paths known to exist on VM101.

```bash
sudo bash /absolute/checkout/deploy/vm101/install-staging.sh \
  /absolute/checkout /absolute/node24/bin/node
```

The installer verifies source hashes, builds an immutable release in a temporary directory, switches the release symlink, installs the dedicated unit, and enables only that unit. Existing settings are preserved. An unrecognized account, directory, unit, drop-in, modified managed file, or existing unmarked state causes a stop with a concrete error instead of an overwrite.

`staging.env` accepts only the six literal, unquoted assignments shown in `staging.env.example`. Keep the state path fixed. Both ports must be explicit, distinct and above 1023. The installer verifies the actual systemd process, executable, working directory, ownership of both loopback sockets, and application health before reporting success.

Inspect the installed result:

```bash
sudo systemctl status bayone-vm101-staging --no-pager
sudo systemctl show bayone-vm101-staging \
  -p MainPID -p MemoryCurrent -p MemoryPeak -p NRestarts -p ActiveState
sudo journalctl --namespace=bayone-vm101-staging \
  -u bayone-vm101-staging --since '-10 minutes' --no-pager
sudo /opt/bayone-vm101-staging/node/bin/node \
  /opt/bayone-vm101-staging/current/deploy/vm101/healthcheck.mjs
```

If you deliberately change the API port, pass the same `BAYONE_STAGE_PUBLIC_PORT` to the last command. `healthy` means the application responds; `modelVerified: false` is intentional. A successful health request is not a real model, customer-delivery, or booking test.

Do not change `bay-one-config.js`, `contact-config.js`, DNS, a public tunnel, or the public origin list as part of this installation. The production service routes remain as documented in the assessment.

## 3. Qualify the failure behavior on the guest

The checked-in test suite uses child processes, loopback HTTP, native SQLite and entirely synthetic data. It tests model unavailability, interrupted request bodies, a response lost after commit, concurrent duplicate retries, conflicting payloads, abrupt process death, database write failure, and checkpoint restore. Run it from the verified full checkout:

```bash
/absolute/node24/bin/node --test tools/vm101-staging.test.mjs
```

Then test the **installed staging unit**, since local tests do not prove guest supervision. Verify first install, same-revision reinstall, release rollback and interrupted-install recovery. Read back guest memory use and the unit's network restrictions; systemd's IP filtering depends on kernel eBPF support, while literal loopback listening is enforced by the application. Save only a synthetic inquiry to port 28795 with a fresh retry key, record the receipt, stop the staging unit, verify that its health becomes unavailable, start it again, and resubmit the same body/key. Require the original receipt and one stored row. Repeat with an abrupt kill of only this unit's MainPID, then read back systemd's new PID and the original receipt. Never kill the Proxmox host or another service for this exercise.

Do not POST these checks to the production cloud receiver: it creates a real record and can notify Tony. The separate private-source harness already exercises the actual Cloud Intake and Owner mapping locally. A controlled production readback and a real VM power-loss exercise remain separate, explicit cutover gates.

## 4. Optional inference on another machine

Run inference on the machine that physically owns the GPU. For the existing Ollama adapter, keep Ollama on that machine's loopback interface and use an authenticated private SSH forward from VM101. After establishing a verified SSH host alias and key, this is the connection shape:

```bash
ssh -N -T -o BatchMode=yes -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
  -L 127.0.0.1:11434:127.0.0.1:11434 verified-gpu-host
```

Run and supervise that tunnel separately from the restricted application unit. Verify its host key. Do not expose an unauthenticated model endpoint to the Internet. If port 11434 is already used on VM101, choose another local port and update the staging URL. For local-only inference, disable Ollama cloud features on the GPU host and verify that the selected model is installed locally.

Only after synthetic model qualification, edit the dedicated configuration:

```dotenv
BAYONE_STAGE_MODEL=ollama
BAYONE_STAGE_OLLAMA_URL=http://127.0.0.1:11434
BAYONE_STAGE_OLLAMA_MODEL=the-exact-locally-installed-model-tag
```

Restart only `bayone-vm101-staging`. Evaluate shop-question accuracy, preliminary estimate policy, structured output, response time, memory and behavior when the GPU machine or tunnel disappears. Keep one concurrent model request initially. A stopped model must yield a truthful fallback while reviewed intake remains usable.

The current adapter calls Ollama's native `/api/chat`. An OpenAI-compatible vLLM endpoint requires a separately verified adapter; changing only the URL is insufficient. A remote GPU cannot be directly passed through to this VM as a PCI device. PCI passthrough applies to hardware attached to the relevant physical host.

## 5. Checkpoint and rollback

The included checkpoint helper stops **only the staging unit**, preserves its prior active state, creates consistent SQLite copies, includes the chat signing key, writes SHA-256 receipts, verifies database integrity, and restarts the unit if it was running:

```bash
sudo bash /opt/bayone-vm101-staging/current/deploy/vm101/backup-staging.sh \
  /absolute/new-synthetic-checkpoint
sudo /opt/bayone-vm101-staging/node/bin/node \
  /opt/bayone-vm101-staging/current/deploy/vm101/snapshot-staging.mjs \
  verify /absolute/new-synthetic-checkpoint
```

This is a **local checkpoint**, not a D1/R2 export or an off-host backup. Before storing any actual customer state on VM101, configure an encrypted independent backup destination, retention, monitoring and a restore exercise. Keep the decryption key recoverable outside this VM. Copying a VM snapshot to storage on the same Proxmox host does not cover host loss.

Restore into a new directory first; verify checksums, row identities and signing identity there. Never overwrite the only surviving state. For this package's fixed installed state path, swapping in a verified synthetic restore requires a stopped unit, preserving the original directory under another name, and restoring dedicated-account ownership. The local tests demonstrate this recovery in a separate temporary directory.

To remove staging from operation immediately:

```bash
sudo systemctl disable --now bayone-vm101-staging
```

Keep its state and receipts. To roll back code, inspect `PREVIOUS_RELEASE`, select that retained release explicitly, atomically switch `current`, and restart the same unit. If the interpreter or unit changed too, compare the saved `.previous` copies before restoring them and run `systemctl daemon-reload`. Do not automatically restore a whole VM baseline after customer writes; that can roll back unrelated services and accepted records.

## Exact continuation boundary

The next executor needs a working remote command/SSH path into VM101 and a verified Node 24 binary to run this package. An actual hosted Bay One migration additionally needs its version-matched source, runtime/secret binding inventory, conversation export and identity/key mapping. The existing managed Cloud Intake and Owner Dashboard sources are recovered; their production data, media, deployed schedules and live cross-service delivery still require independent evidence before any data move or routing change.
