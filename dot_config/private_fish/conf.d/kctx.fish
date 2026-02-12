# Per-shell kubeconfig isolation
# Inspired by: https://jackma.com/2019/11/23/one-kubectl-context-per-shell-session/
#
# Each shell session gets its own current-context, so switching context in one
# terminal doesn't affect other terminals. New shells start with no active
# context — kubectl only works after explicitly selecting one via kctx.

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

__kctx_init
