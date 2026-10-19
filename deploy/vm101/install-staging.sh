#!/usr/bin/env bash
# Install only isolated synthetic staging. Existing production services and data are not targets.
set -euo pipefail
umask 077
stage_path=/usr/sbin:/usr/bin:/sbin:/bin
export PATH="$stage_path"
fail() { printf '%s\n' "$*" >&2; exit 2; }
[[ $(id -u) == 0 && $# == 2 ]] ||
  fail 'Usage: sudo bash deploy/vm101/install-staging.sh /absolute/source-checkout /absolute/node24/bin/node'
[[ $1 == /* && $2 == /* ]] || fail 'Use absolute source and Node paths'
for stage_command in realpath git sha256sum stat install cmp mktemp flock systemctl ss getent useradd; do
  command -v "$stage_command" >/dev/null || fail "Missing prerequisite: $stage_command"
done
stage_source=$(realpath "$1")
stage_node=$(realpath "$2")
stage_root=/opt/bayone-vm101-staging
stage_state=/var/lib/bayone-vm101-staging
stage_etc=/etc/bayone-vm101-staging
stage_unit=bayone-vm101-staging.service
stage_unit_path=/etc/systemd/system/bayone-vm101-staging.service
stage_journal_path=/etc/systemd/journald@bayone-vm101-staging.conf
stage_purpose=bayone-vm101-synthetic-staging-v1
stage_temps=()
cleanup() {
  if (( ${#stage_temps[@]} )); then rm -rf -- "${stage_temps[@]}"; fi
}
trap cleanup EXIT
node_run() { env -i PATH="$stage_path" "$stage_node" "$@"; }
# Trust only the explicitly supplied checkout for this invocation, never global Git configuration.
source_git() { git -c safe.directory="$stage_source" -C "$stage_source" "$@"; }
[[ -x "$stage_node" && -f "$stage_source/deploy/vm101/staging.mjs" ]] || fail 'Missing Node executable or staging source'
[[ $(node_run -p 'process.versions.node.split(".")[0]') == 24 ]] || fail 'Node 24 is required'
node_run -e 'const {DatabaseSync,backup}=require("node:sqlite"); if(typeof backup!=="function")throw Error("SQLite backup unavailable"); const d=new DatabaseSync(":memory:"); d.close()'
stage_node_version=$(node_run -p 'process.versions.node')
stage_node_hash=$(sha256sum "$stage_node" | cut -d' ' -f1)
stage_git=0
if [[ -d "$stage_source/.git" || -f "$stage_source/.git" ]]; then
  [[ -z $(source_git status --porcelain --untracked-files=normal) ]] || fail 'Use a clean committed checkout'
  [[ $(source_git rev-parse --show-toplevel) == "$stage_source" ]] || fail 'Use the repository root'
  stage_revision=$(source_git rev-parse HEAD)
  stage_git=1
else
  [[ -f "$stage_source/REVISION" && -f "$stage_source/SHA256SUMS" ]] ||
    fail 'An archive requires REVISION and SHA256SUMS receipts; otherwise use a clean git checkout'
  stage_revision=$(cat "$stage_source/REVISION")
fi
[[ $stage_revision =~ ^[a-f0-9]{40}$ ]] || fail 'Invalid source revision'

# No globs: do not copy tests, runtime.json, databases, Windows state or private backend source.
stage_files=(
  _website-intake/server.mjs _website-intake/lead-routing.mjs
  _website-intake/urgent-alerts.mjs _website-intake/lead-notify.mjs _website-intake/lead-desk.mjs
  _website-intake/zoho-estimates.mjs _website-intake/lead-media.mjs _website-intake/car-location.mjs
  _website-intake/customer-texts.mjs _website-intake/inbox.html _website-intake/inbox.css
  _website-intake/inbox.js _website-intake/widget.js _website-intake/routing-rules.json
  deploy/vm101/staging.mjs deploy/vm101/healthcheck.mjs deploy/vm101/staging.env.example
  deploy/vm101/install-staging.sh deploy/vm101/bayone-vm101-staging.service
  deploy/vm101/snapshot-staging.mjs deploy/vm101/backup-staging.sh deploy/vm101/journald-staging.conf
)
stage_expected=$(mktemp)
stage_temps+=("$stage_expected")
for stage_file in "${stage_files[@]}"; do
  [[ -f "$stage_source/$stage_file" && ! -L "$stage_source/$stage_file" &&
     $(realpath "$stage_source/$stage_file") == "$stage_source/$stage_file" ]] ||
    fail "Missing or symlinked source file: $stage_file"
  if [[ $stage_git == 1 ]]; then
    stage_hash=$(source_git show "$stage_revision:$stage_file" | sha256sum | cut -d' ' -f1)
  else
    stage_hash=$(awk -v file="$stage_file" '$2 == file {print $1}' "$stage_source/SHA256SUMS")
  fi
  [[ $stage_hash =~ ^[a-f0-9]{64}$ ]] || fail "Missing source checksum: $stage_file"
  [[ $(sha256sum "$stage_source/$stage_file" | cut -d' ' -f1) == "$stage_hash" ]] ||
    fail "Source does not match revision/manifest: $stage_file"
  printf '%s  %s\n' "$stage_hash" "$stage_file" >> "$stage_expected"
done

root_owned() {
  [[ ! -L "$1" && $(stat -c '%u' "$1") == 0 ]] || fail "Unexpected owner or symlink: $1"
  local stage_mode
  stage_mode=$(stat -c '%a' "$1")
  (( (8#$stage_mode & 0022) == 0 )) || fail "Group/world-writable managed path: $1"
}
for stage_directory in "$stage_root" "$stage_root/releases" "$stage_root/node" "$stage_root/node/bin" "$stage_etc"; do
  if [[ -e "$stage_directory" || -L "$stage_directory" ]]; then
    [[ -d "$stage_directory" && $(realpath "$stage_directory") == "$stage_directory" ]] ||
      fail "Unexpected installation path: $stage_directory"
    root_owned "$stage_directory"
  fi
done
stage_managed=0
if [[ -e "$stage_root" ]]; then
  [[ -f "$stage_root/INSTALLATION" ]] || fail 'Refusing an unrecognized installation directory'
  root_owned "$stage_root/INSTALLATION"
  [[ $(cat "$stage_root/INSTALLATION") == "$stage_purpose" ]] || fail 'Wrong installation marker'
  stage_managed=1
fi
if [[ -e "$stage_etc" && $stage_managed != 1 ]]; then fail 'Refusing an unmanaged configuration directory'; fi
stage_managed_manifest="$stage_root/MANAGED_FILES.sha256"
if [[ -e "$stage_managed_manifest" || -L "$stage_managed_manifest" ]]; then
  [[ -f "$stage_managed_manifest" ]] || fail 'Invalid managed-file receipt'
  root_owned "$stage_managed_manifest"
fi
check_managed_file() {
  local stage_destination=$1 stage_proposed=$2 stage_recorded=''
  if [[ -e "$stage_destination" || -L "$stage_destination" ]]; then
    [[ $stage_managed == 1 && -f "$stage_destination" ]] || fail "Refusing unmanaged file: $stage_destination"
    root_owned "$stage_destination"
    if [[ -f "$stage_managed_manifest" ]]; then
      stage_recorded=$(awk -v file="$stage_destination" '$2 == file {print $1}' "$stage_managed_manifest")
    fi
    if [[ $stage_recorded =~ ^[a-f0-9]{64}$ ]]; then
      [[ $(sha256sum "$stage_destination" | cut -d' ' -f1) == "$stage_recorded" ]] ||
        fail "Managed file was locally modified; review it before reinstalling: $stage_destination"
    else
      # Recover an interrupted first installation only when bytes equal this verified source.
      cmp -s "$stage_destination" "$stage_proposed" || fail "No matching ownership receipt: $stage_destination"
    fi
  fi
}
check_managed_file "$stage_unit_path" "$stage_source/deploy/vm101/bayone-vm101-staging.service"
check_managed_file "$stage_journal_path" "$stage_source/deploy/vm101/journald-staging.conf"
stage_fragment=$(systemctl show "$stage_unit" --property=FragmentPath --value)
[[ -z "$stage_fragment" || "$stage_fragment" == "$stage_unit_path" ]] || fail 'Unexpected service definition'
[[ -z $(systemctl show "$stage_unit" --property=DropInPaths --value) ]] || fail 'Review existing staging service drop-ins before reinstalling'
if [[ -e "$stage_state" || -L "$stage_state" ]]; then
  [[ -d "$stage_state" && ! -L "$stage_state" && $(realpath "$stage_state") == "$stage_state" ]] ||
    fail 'Staging state must be a real, dedicated directory'
  node_run --input-type=module - "$stage_state" "$stage_purpose" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
const [directory, purpose] = process.argv.slice(2), marker = path.join(directory, '.bayone-staging.json');
if (fs.readdirSync(directory).length) {
  if (!fs.existsSync(marker) || fs.lstatSync(marker).isSymbolicLink()) throw Error('Refusing unmarked existing data');
  const value = JSON.parse(fs.readFileSync(marker, 'utf8'));
  if (value.purpose !== purpose || value.syntheticOnly !== true) throw Error('Wrong staging data marker');
}
NODE
fi
stage_account=$(getent passwd bayone-stage || true)
if [[ -n "$stage_account" ]]; then
  [[ $stage_managed == 1 ]] || fail 'Refusing an existing unmanaged service account'
  IFS=: read -r stage_name stage_password stage_uid stage_gid stage_gecos stage_home stage_shell <<< "$stage_account"
  [[ $stage_uid != 0 && $stage_home == "$stage_state" && $stage_shell == /usr/sbin/nologin &&
     $(getent group bayone-stage | cut -d: -f3) == "$stage_gid" &&
     $(id -G bayone-stage) == "$stage_gid" ]] || fail 'Unexpected existing service account or groups'
elif getent group bayone-stage >/dev/null; then
  fail 'Refusing an existing unmanaged service group'
fi
stage_env="$stage_etc/staging.env"
stage_env_input="$stage_source/deploy/vm101/staging.env.example"
if [[ -e "$stage_env" || -L "$stage_env" ]]; then
  [[ $stage_managed == 1 && -f "$stage_env" ]] || fail 'Refusing unmanaged staging settings'
  root_owned "$stage_env"
  stage_env_input="$stage_env"
fi
# Parse settings as data, never shell-source them. This is the same configuration the unit loads.
stage_ports=$(node_run --input-type=module - "$stage_env_input" "$stage_state" "$stage_source/deploy/vm101/staging.mjs" <<'NODE'
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const [file, state, modulePath] = process.argv.slice(2);
const allowed = new Set(['BAYONE_STAGE_DATA_DIR','BAYONE_STAGE_PUBLIC_PORT','BAYONE_STAGE_INBOX_PORT',
  'BAYONE_STAGE_MODEL','BAYONE_STAGE_OLLAMA_URL','BAYONE_STAGE_OLLAMA_MODEL']);
const settings = {};
for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const match = line.match(/^([A-Z_]+)=([^"'\\\r\n]*)$/);
  if (!match || !allowed.has(match[1]) || Object.hasOwn(settings, match[1]) ||
      match[2] !== match[2].trim() || match[2].includes('#')) throw Error('Unsupported staging.env assignment');
  settings[match[1]] = match[2];
}
const {readConfig} = await import(pathToFileURL(modulePath));
const config = readConfig(settings);
if (config.dataDir !== state || !config.publicPort || !config.adminPort) throw Error('Use the fixed staging data path and explicit ports');
process.stdout.write(config.publicPort + ' ' + config.adminPort);
NODE
)
read -r stage_port stage_admin_port <<< "$stage_ports"

install -d -m 0755 "$stage_root"
if [[ $stage_managed != 1 ]]; then printf '%s\n' "$stage_purpose" > "$stage_root/INSTALLATION"; fi
[[ ! -L "$stage_root/.install.lock" ]] || fail 'Unexpected installer lock'
exec 9>"$stage_root/.install.lock"
flock -n 9 || fail 'Another staging installation is running'
install -d -m 0755 "$stage_root/releases" "$stage_root/node/bin"
install -d -m 0700 "$stage_etc"
stage_release="$stage_root/releases/$stage_revision"
verify_release() {
  local stage_candidate=$1
  [[ -d "$stage_candidate" && ! -L "$stage_candidate" ]] || fail 'Invalid release directory'
  root_owned "$stage_candidate"
  node_run --input-type=module - "$stage_candidate" "${stage_files[@]}" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
const [root, ...files] = process.argv.slice(2);
const allowed = new Set([...files, 'REVISION', 'SHA256SUMS']);
function walk(relative = '') {
  for (const entry of fs.readdirSync(path.join(root, relative), {withFileTypes: true})) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw Error('Release must not contain symlinks');
    if (entry.isDirectory()) walk(name);
    else if (!entry.isFile() || !allowed.has(name)) throw Error('Unexpected release content: ' + name);
  }
}
walk();
NODE
  [[ -f "$stage_candidate/REVISION" && $(cat "$stage_candidate/REVISION") == "$stage_revision" ]] ||
    fail 'Release revision receipt is missing or incorrect'
  cmp -s "$stage_expected" "$stage_candidate/SHA256SUMS" || fail 'Release manifest differs from verified source'
  (cd "$stage_candidate"; sha256sum --check --status SHA256SUMS) || fail 'Release checksum mismatch'
}
if [[ -e "$stage_release" || -L "$stage_release" ]]; then
  verify_release "$stage_release"
else
  stage_build=$(mktemp -d "$stage_root/releases/.building.XXXXXXXX")
  stage_temps+=("$stage_build")
  for stage_file in "${stage_files[@]}"; do
    install -D -m 0644 "$stage_source/$stage_file" "$stage_build/$stage_file"
    if [[ $stage_file == *.mjs ]]; then node_run --check "$stage_build/$stage_file"; fi
  done
  printf '%s\n' "$stage_revision" > "$stage_build/REVISION"
  install -m 0644 "$stage_expected" "$stage_build/SHA256SUMS"
  chmod -R a+rX "$stage_build"
  verify_release "$stage_build"
  mv -T "$stage_build" "$stage_release"
fi
if [[ -e "$stage_root/current" || -L "$stage_root/current" ]]; then
  [[ -L "$stage_root/current" ]] || fail 'Current release must be a managed symlink'
  stage_previous=$(readlink -f "$stage_root/current")
  [[ $stage_previous == "$stage_root/releases/"* && -f "$stage_previous/REVISION" ]] || fail 'Unexpected current release target'
  if [[ $stage_previous != "$stage_release" ]]; then printf '%s\n' "$stage_previous" > "$stage_root/PREVIOUS_RELEASE"; fi
fi
if [[ -z "$stage_account" ]]; then
  useradd --system --user-group --home-dir "$stage_state" --no-create-home --shell /usr/sbin/nologin bayone-stage
fi
if [[ ! -e "$stage_env" ]]; then install -m 0600 "$stage_release/deploy/vm101/staging.env.example" "$stage_env"; fi
# Preserve the previous interpreter only when its bytes change; reruns retain that rollback copy.
if [[ -e "$stage_root/node/bin/node" || -L "$stage_root/node/bin/node" ]]; then
  root_owned "$stage_root/node/bin/node"
  if [[ $(sha256sum "$stage_root/node/bin/node" | cut -d' ' -f1) != "$stage_node_hash" ]]; then
    install -m 0755 "$stage_root/node/bin/node" "$stage_root/node/bin/node.previous"
  fi
fi
stage_node_new=$(mktemp "$stage_root/node/bin/.node.XXXXXXXX")
stage_temps+=("$stage_node_new")
install -m 0755 "$stage_node" "$stage_node_new"
[[ $(sha256sum "$stage_node_new" | cut -d' ' -f1) == "$stage_node_hash" ]] || fail 'Copied Node checksum mismatch'
mv -Tf "$stage_node_new" "$stage_root/node/bin/node"
printf '%s\n' "$stage_node_version" > "$stage_root/NODE_VERSION"
printf '%s\n' "$stage_node_hash" > "$stage_root/NODE_SHA256"
stage_link_dir=$(mktemp -d "$stage_root/.switch.XXXXXXXX")
stage_temps+=("$stage_link_dir")
ln -s "$stage_release" "$stage_link_dir/current"
mv -Tf "$stage_link_dir/current" "$stage_root/current"
for stage_pair in "$stage_unit_path|bayone-vm101-staging.service" "$stage_journal_path|journald-staging.conf"; do
  stage_destination=${stage_pair%%|*}
  stage_origin="$stage_release/deploy/vm101/${stage_pair#*|}"
  if [[ -f "$stage_destination" ]] && ! cmp -s "$stage_destination" "$stage_origin"; then
    install -m 0600 "$stage_destination" "$stage_root/${stage_pair#*|}.previous"
  fi
  stage_config_new=$(mktemp "$(dirname "$stage_destination")/.bayone-staging.XXXXXXXX")
  stage_temps+=("$stage_config_new")
  install -m 0644 "$stage_origin" "$stage_config_new"
  mv -Tf "$stage_config_new" "$stage_destination"
done
stage_receipt_new=$(mktemp "$stage_root/.managed-files.XXXXXXXX")
stage_temps+=("$stage_receipt_new")
sha256sum "$stage_unit_path" "$stage_journal_path" > "$stage_receipt_new"
mv -Tf "$stage_receipt_new" "$stage_managed_manifest"
systemctl daemon-reload
systemctl enable "$stage_unit"
systemctl reset-failed "$stage_unit"
systemctl restart "$stage_unit"
for ((stage_try=0; stage_try<15; stage_try++)); do
  stage_pid=$(systemctl show "$stage_unit" --property=MainPID --value)
  if [[ $stage_pid =~ ^[1-9][0-9]*$ ]] && systemctl is-active --quiet "$stage_unit" &&
     [[ $(readlink -f "/proc/$stage_pid/exe") == "$stage_root/node/bin/node" &&
        $(readlink -f "/proc/$stage_pid/cwd") == "$stage_release" ]] &&
     ss -H -ltnp "sport = :$stage_port" |
       awk -v wanted="127.0.0.1:$stage_port" -v owner="pid=$stage_pid," '$4 == wanted && index($0, owner) {found++} END {exit found != 1}' &&
     ss -H -ltnp "sport = :$stage_admin_port" |
       awk -v wanted="127.0.0.1:$stage_admin_port" -v owner="pid=$stage_pid," '$4 == wanted && index($0, owner) {found++} END {exit found != 1}' &&
     env -i PATH="$stage_path" BAYONE_STAGE_PUBLIC_PORT="$stage_port" \
       "$stage_root/node/bin/node" "$stage_release/deploy/vm101/healthcheck.mjs"; then
    printf 'Staging ready; revision %s; Node %s; PID %s. Production traffic is unchanged.\n' "$stage_revision" "$stage_node_version" "$stage_pid"
    exit 0
  fi
  sleep 1
done
printf '%s\n' 'Staging is not verified healthy. Inspect systemctl status bayone-vm101-staging and journalctl --namespace=bayone-vm101-staging -u bayone-vm101-staging. State and previous-release receipts were preserved.' >&2
exit 1
