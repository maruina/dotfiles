function ddsshgen --description "Generate an SSH certificate in the dedicated ddtool agent; start it with launchctl bootstrap; see plans/ddtool-ssh-agent/plan.md for stale-socket recovery"
    set -l socket "$HOME/.ssh/ddtool-agent.sock"

    if test (count $argv) -ne 1
        printf 'Usage: ddsshgen <environment>\n' >&2
        return 2
    end

    if not test -S "$socket"
        printf 'Dedicated ddtool SSH agent socket is unavailable: %s\n' "$socket" >&2
        printf 'Start it with: launchctl bootstrap gui/%s %s\n' (id -u) "$HOME/Library/LaunchAgents/com.matteo.ruina.ddtool-ssh-agent.plist" >&2
        printf 'For stale-socket recovery, see plans/ddtool-ssh-agent/plan.md in the chezmoi source.\n' >&2
        return 1
    end

    command ddtool operator ssh-keygen --env "$argv[1]" --ssh-auth-socket "$socket"
    return $status
end
