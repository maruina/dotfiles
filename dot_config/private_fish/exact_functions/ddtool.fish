function ddtool --wraps=ddtool --description "ddtool with kctx-aware context initialization"
    # Pass through anything that isn't `ddtool clusters use <cluster>`
    if test (count $argv) -lt 3; or test "$argv[1]" != clusters; or test "$argv[2]" != use
        command ddtool $argv
        return $status
    end

    # Find the first positional arg (cluster name) and detect --breakglass.
    set -l cluster
    set -l breakglass 0
    for arg in $argv[3..]
        switch $arg
            case --breakglass
                set breakglass 1
            case '-*'
                # other flags (e.g. --help): skip
            case '*'
                set cluster $arg
                break
        end
    end

    # No cluster supplied (e.g. bare --help) — pass through untouched.
    if test -z "$cluster"
        command ddtool $argv
        return $status
    end

    # Run with only the persistent kubeconfig so new cluster/context/user entries
    # land in ~/.kube/config instead of the per-shell session tempfile.
    env KUBECONFIG=$HOME/.kube/config command ddtool $argv
    set -l rc $status
    if test $rc -ne 0
        return $rc
    end

    # ddtool sets current-context in ~/.kube/config; scrub it — per-shell session files own that field.
    env KUBECONFIG=$HOME/.kube/config kubectl config unset current-context >/dev/null

    # Switch the per-shell session current-context.
    set -l ctx $cluster
    if test $breakglass -eq 1
        set ctx "$cluster-breakglass"
    end
    kctx $ctx
end
