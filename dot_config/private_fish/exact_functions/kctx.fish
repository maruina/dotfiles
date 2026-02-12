function kctx --description "Switch kubectl context (isolated per shell)"
    # Initialize per-shell kubeconfig on first use (no-op if conf.d already ran)
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
