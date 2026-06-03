#!/bin/bash
# Wrapper script to inject Home Assistant environment variables into bash
# Usage: source ha-wrapper.sh && ha-get-state sun.sun
# Or: ./ha-wrapper.sh ha-get-state sun.sun

# Export Home Assistant environment variables from Fish config
eval "$(fish -c 'echo "export HOME_ASSISTANT_URL=$HOME_ASSISTANT_URL"; echo "export HOME_ASSISTANT_TOKEN=$HOME_ASSISTANT_TOKEN"')"

# If called with arguments, execute them
if [ $# -gt 0 ]; then
  exec "$@"
fi
