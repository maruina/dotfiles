function ddssh --description "Run OpenSSH with the dedicated ddtool agent; start it with launchctl bootstrap; see plans/ddtool-ssh-agent/plan.md for stale-socket recovery"
    set -l socket "$HOME/.ssh/ddtool-agent.sock"

    if not test -S "$socket"
        printf 'Dedicated ddtool SSH agent socket is unavailable: %s\n' "$socket" >&2
        printf 'Start it with: launchctl bootstrap gui/%s %s\n' (id -u) "$HOME/Library/LaunchAgents/com.matteo.ruina.ddtool-ssh-agent.plist" >&2
        printf 'For stale-socket recovery, see plans/ddtool-ssh-agent/plan.md in the chezmoi source.\n' >&2
        return 1
    end

    command ssh -o "IdentityAgent=$socket" $argv
    return $status
end
