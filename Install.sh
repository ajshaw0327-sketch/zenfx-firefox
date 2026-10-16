#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
python3 installer/install.py --guided
result=$?
if [ "$result" -ne 0 ]; then
  printf '\nSetup stopped. Review the error above; see START-HERE.md.\n'
  read -r reply
fi
exit "$result"
