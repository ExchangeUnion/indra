#!/usr/bin/env bash
set -e

dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
project="`cat $dir/../../package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"
cypress="node_modules/.bin/cypress"
ui="${1:-daicard}"

# Make sure bare minimum dependencies are installed
if [[ ! -f "$cypress" || ! -d "./node_modules/ethers" ]]
then npm i --no-save
fi
$cypress install

########################################
## Start the UI e2e watcher if in watch mode

# If there's no response from port 3000 we're in prod mode using ssl
if [[ -z "`curl -s http://localhost:3000`" ]]
then env="--env publicUrl=https://localhost"
fi

if [[ "$1" == "--watch" ]]
then
  $cypress open $env
  exit 0
fi

########################################
## Start the UI e2e tests if in standalone test mode

export ELECTRON_ENABLE_LOGGING=true
$cypress run $env --spec cypress/tests/$ui.js
