#!/usr/bin/env bash
set -e

agents="$1"
interval="$2"
echo "Starting bot test with $agents agents and interval $interval"

dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
project="`cat $dir/../../package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"

INDRA_ETH_RPC_URL="${INDRA_ETH_RPC_URL:-http://172.17.0.1:3000/api/ethprovider}"
INDRA_NODE_URL="${INDRA_NODE_URL:-http://172.17.0.1:3000/api}"
INDRA_NATS_URL="${INDRA_NATS_URL:-nats://172.17.0.1:4222}"
BOT_REGISTRY_URL="${BOT_REGISTRY_URL:-http://172.17.0.1:3333}"

agent_name="${project}_bot"

# Kill the dependency containers when this script exits
function cleanup {
  exit_code="0"
  echo;
  for (( n=1; n<=$agents; n++ ))
  do 
    if [[ -n "`docker container ls -a | grep $agent_name`" ]]
    then
      echo "Stopping agent $n.."
      docker container stop ${agent_name}_$n &> /dev/null || true
      agent_code="`docker container inspect ${agent_name}_$n | jq '.[0].State.ExitCode'`"
      if [[ "$agent_code" != "0" ]]
      then
        echo "agent failed: $agent_code";
        exit_code="$agent_code";
      fi
      docker container rm ${agent_name}_$n &> /dev/null || true
    fi
  done
  if [[ -n "`docker container ls -a | grep bot-registry`" ]]
  then
    echo "Stopping bot-registry.."
    docker container stop bot-registry &> /dev/null || true
    agent_code="`docker container inspect bot-registry | jq '.[0].State.ExitCode'`"
    docker container rm bot-registry &> /dev/null || true
  fi
exit $exit_code
}
trap cleanup EXIT SIGINT

if [[ -t 0 && -t 1 && -t 2 ]]
then interactive="--interactive --tty"
else echo "Running in non-interactive mode"
fi

echo "Starting bot registry container"
docker run \
  --detach \
  --entrypoint="bash" \
  $interactive \
  --name="bot-registry" \
  --volume="`pwd`:/root" \
  -p 3333:3333 \
  ${project}_builder -c '
    set -e
    echo "Bot registry container launched!"
    cd modules/bot-registry
    export PATH=./node_modules/.bin:$PATH
    function finish {
      echo && echo "Bot container exiting.." && exit
    }
    trap finish SIGTERM SIGINT
    echo "Launching agent!";echo
    npm run start
  '
  docker logs --follow bot-registry &

for (( n=1; n<=$agents; n++ ))
do
  agent="${agent_name}_$n"

  echo "Creating new private keys"
  agent_key="0x`hexdump -n 32 -e '"%08X"' < /dev/urandom | tr '[:upper:]' '[:lower:]'`"

  agent_address="`node <<<'var eth = require("ethers"); console.log((new eth.Wallet("'"$agent_key"'")).address);'`"
  agent_pub_key="`node <<<'var eth = require("ethers"); console.log((new eth.Wallet("'"$agent_key"'")).signingKey.publicKey);'`"

  echo "Funding agent: $agent_address (pubKey: ${agent_pub_key})"
  bash ops/fund.sh $agent_address

  echo "Starting agent container $n"
  docker run \
    --detach \
    --entrypoint="bash" \
    --env="LOG_LEVEL=$LOG_LEVEL" \
    --env="INDRA_ETH_RPC_URL=$INDRA_ETH_RPC_URL" \
    --env="INDRA_NODE_URL=$INDRA_NODE_URL" \
    --env="INDRA_NATS_URL=$INDRA_NATS_URL" \
    --env="BOT_REGISTRY_URL"="$BOT_REGISTRY_URL" \
    $interactive \
    --name="$agent" \
    --volume="`pwd`:/root" \
    ${project}_builder -c '
      set -e
      echo "Bot container launched!"
      cd modules/bot
      export PATH=./node_modules/.bin:$PATH
      function finish {
        echo && echo "Bot container exiting.." && exit
      }
      trap finish SIGTERM SIGINT
      echo "Launching agent!";echo
      npm run start -- bot --private-key '$agent_key' --concurrency-index '$n' --interval '$interval'
    '

  docker logs --follow $agent &
done

# wait for bots to finish
while true
do
  if [[ \
    -z "`docker container ls | grep $agent_name | grep "Up"`" \
  ]]
  then break
  else sleep 3;
  fi
done
