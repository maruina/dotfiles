# Kubectl context switcher with per-shell isolation
# Inspired by: https://jackma.com/2019/11/23/one-kubectl-context-per-shell-session/
#
# Each shell session gets its own current-context, so switching context in one
# terminal doesn't affect other terminals.

function __kctx_init --description "Initialize per-shell kubeconfig isolation"
    # Skip if already initialized
    if set -q __KCTX_INITIALIZED
        return 0
    end

    # Ensure ~/.kube/config exists
    if not test -e ~/.kube/config
        mkdir -p ~/.kube
        touch ~/.kube/config
    end

    # Create a minimal session kubeconfig that only overrides current-context.
    # Prepended to KUBECONFIG so it wins the merge for current-context,
    # while ~/.kube/config provides clusters/contexts/users.
    set -gx KUBECONFIG_SESSION (mktemp -t "kubeconfig.XXXXXX")
    or begin
        echo "kctx: failed to create session kubeconfig tempfile" >&2
        return 1
    end
    __kctx_reset

    if set -q KUBECONFIG; and test -n "$KUBECONFIG"
        set -gx KUBECONFIG "$KUBECONFIG_SESSION:$KUBECONFIG"
    else
        set -gx KUBECONFIG "$KUBECONFIG_SESSION:$HOME/.kube/config"
    end

    # Mark as initialized
    set -gx __KCTX_INITIALIZED 1

    # Clean up temp file when shell exits
    function __kctx_cleanup --on-event fish_exit
        if set -q KUBECONFIG_SESSION; and test -f "$KUBECONFIG_SESSION"
            rm -f $KUBECONFIG_SESSION
        end
    end
end

function __kctx_reset --description "Reset session kubeconfig to no current-context"
    if not set -q KUBECONFIG_SESSION; or test -z "$KUBECONFIG_SESSION"
        echo "kctx: session kubeconfig not initialized" >&2
        return 1
    end
    # Set current-context to a non-existent sentinel. Because the session
    # file is first in KUBECONFIG, this wins the merge and kubectl fails
    # with "context not found" until you explicitly switch with kctx.
    echo 'apiVersion: v1
kind: Config
current-context: no-context
clusters: []
contexts: []
users: []
preferences: {}' >$KUBECONFIG_SESSION
    or begin
        echo "kctx: failed to write session kubeconfig to $KUBECONFIG_SESSION" >&2
        return 1
    end
end

function kctx --description "Switch kubectl context (isolated per shell)"
    # Initialize per-shell kubeconfig on first use
    __kctx_init

    if test "$argv[1]" = --reset
        if __kctx_reset
            echo "Session kubeconfig reset. No current context set."
        end
        return $status
    else if test (count $argv) -eq 0
        # No arguments: use fzf if available, otherwise show current context
        if type -q fzf
            set -l selected (kubectl config get-contexts -o name 2>/dev/null | fzf --height=40% --reverse --prompt="Switch context: ")
            if test -n "$selected"
                kubectl config use-context $selected
            end
        else
            # Just show current context
            set -l current (kubectl config current-context 2>/dev/null)
            if test -n "$current"
                echo "Current context: $current"
                echo ""
                echo "Available contexts:"
                kubectl config get-contexts
            else
                echo "No current context set."
                echo ""
                echo "Available contexts:"
                kubectl config get-contexts -o name 2>/dev/null
            end
        end
    else if test "$argv[1]" = "-"
        # Switch to previous context (if stored)
        if set -q __KCTX_PREVIOUS; and test -n "$__KCTX_PREVIOUS"
            set -l current (kubectl config current-context 2>/dev/null)
            kubectl config use-context $__KCTX_PREVIOUS
            set -gx __KCTX_PREVIOUS $current
        else
            echo "No previous context to switch to." >&2
            return 1
        end
    else
        # Switch to specified context
        set -l current (kubectl config current-context 2>/dev/null)
        if kubectl config use-context $argv[1]
            set -gx __KCTX_PREVIOUS $current
        end
    end
end

# Autocompletion: complete with available context names
complete -c kctx -f -a "(kubectl config get-contexts -o name 2>/dev/null)"
complete -c kctx -f -s h -l help -d "Show help"
complete -c kctx -f -a "-" -d "Switch to previous context"
complete -c kctx -f -l reset -d "Clear current context for this shell session"
