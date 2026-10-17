#!/usr/bin/env bash
# Local checkpoint only. The operator must separately configure an encrypted off-host destination.
set -euo pipefail
umask 077
[[ $(id -u) == 0 && $# == 1 && $1 == /* ]] || { echo 'Usage: sudo bash backup-staging.sh /absolute/new-snapshot' >&2; exit 2; }
stage_unit=bayone-vm101-staging.service
stage_active=0
if systemctl is-active --quiet "$stage_unit"; then stage_active=1; fi
stage_status=$(systemctl show "$stage_unit" --property=LoadState --value)
[[ $stage_status == loaded ]] || { echo 'Staging unit is not installed' >&2; exit 2; }
# Do not copy the default directory while a relocated configuration uses another one.
stage_data_lines=$(awk -F= '$1 == "BAYONE_STAGE_DATA_DIR" { print substr($0, index($0,"=")+1) }' /etc/bayone-vm101-staging/staging.env)
[[ $stage_data_lines == /var/lib/bayone-vm101-staging ]] || { echo 'Unexpected configured state directory; review backup path before proceeding' >&2; exit 2; }
trap 'if [[ $stage_active == 1 ]]; then systemctl start "$stage_unit"; fi' EXIT
systemctl stop "$stage_unit"
# Fixed installed state path. If you relocate it, update/review this script as part of that change.
/opt/bayone-vm101-staging/node/bin/node /opt/bayone-vm101-staging/current/deploy/vm101/snapshot-staging.mjs \
  create /var/lib/bayone-vm101-staging "$1"
