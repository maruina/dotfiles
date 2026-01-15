function __no_zoxide_history_pre --on-event fish_preexec
    set -g __no_zoxide_history_cmd $argv[1]
end

function __no_zoxide_history_purge --on-event fish_prompt
    set -l cmd $__no_zoxide_history_cmd
    set -e __no_zoxide_history_cmd

    test -n "$cmd"; or return

    # Only zoxide-related commands
    if not string match -qr '^(z|zi|zoxide)(\s|$)' -- $cmd
        return
    end

    # Delete exactly what fish stored (fish may normalize paths, but if you typed the slash,
    # this still works; if it normalized, we also try the trailing-slash variant).
    history delete --exact --case-sensitive -- $cmd 2>/dev/null

    # If fish stored a trailing slash variant, try that too (no prompt; exact match only).
    if not string match -qr '/\s*$' -- $cmd
        history delete --exact --case-sensitive -- "$cmd/" 2>/dev/null
    end
end
