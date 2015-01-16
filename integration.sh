#!/bin/bash

trap 'kill $(jobs -p)' EXIT

cd agent
source venv/bin/activate
python3 agent.py &
AGENT_PID=$!

cd ../remote; mocha
SUCCESS=$?

# sleep 5

echo $AGENT_PID

kill "$AGENT_PID"
while kill -0 "$AGENT_PID"; do
    sleep 0.5
done

exit $SUCCESS
