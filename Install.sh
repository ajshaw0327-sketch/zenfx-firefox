#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
python3 installer/install.py --gui
result=$?
if [ "$result" -ne 0 ]; then
  printf '\nSetup needs Python 3.10+ with Tk. See START-HERE.md.\n'
  read -r reply
fi
exit "$result"
