#!/bin/bash

trap '[ -n "$(jobs -pr)" ] && kill $(jobs -pr)' INT QUIT TERM EXIT

cd agent
source venv/bin/activate
python3 src/agent.py &
AGENT_PID=$!

cd ../remote; mocha
SUCCESS=$?

# sleep 5

isalive() {
	kill -0 "$1" >/dev/null 2>&1
	return $?
}

kill "$AGENT_PID" >/dev/null 2>&1
while isalive "$AGENT_PID"; do
    sleep 0.5
done

exit $SUCCESS
