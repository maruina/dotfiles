function rex-name-session --description 'Name a single-pane Rex session after the repository; preserve keep: names'
    if test (count $argv) -ne 0
        echo 'Usage: rex-name-session' >&2
        return 2
    end
    if test -z "$REX_SESSION"; or test -z "$REX_BLOCK"
        echo 'rex-name-session: REX_SESSION and REX_BLOCK are required' >&2
        return 1
    end

    set -l snapshot (rex session inspect "$REX_SESSION" --json | string collect)
    or return 1
    set -l label (printf '%s' "$snapshot" | jq -er '.label')
    or return 1
    if string match -q 'keep:*' -- "$label"
        return 0
    end
    # deliberate: preserve every split layout, even when only one pane runs Pi.
    # Agent-aware shared-tab naming can replace this conservative rule later.
    printf '%s' "$snapshot" | jq -e --arg block "$REX_BLOCK" '[.windows[].layers[].blocks[].block_id] as $blocks | (.windows | length) == 1 and $blocks == [$block]' >/dev/null
    or return 0

    set -l root (git rev-parse --show-toplevel 2>/dev/null)
    set -l name
    if test -n "$root"
        set -l remote (git remote get-url origin 2>/dev/null)
        if test -z "$remote"
            set -l remotes (git remote)
            if test (count $remotes) -gt 0
                set remote (git remote get-url "$remotes[1]")
                or return 1
            end
        end
        if test -n "$remote"
            set name (string replace -r '/+$' '' -- "$remote" | string replace -r '^.*[/:]' '' | string replace -r '\.git$' '')
        else
            set name (path basename "$root")
        end
    else
        set name (path basename "$PWD")
    end
    if test -z "$name"
        echo 'rex-name-session: cannot determine a repository or directory name' >&2
        return 1
    end
    if test "$label" != "$name"
        rex session rename "$REX_SESSION" "$name"
        or return 1
    end
    rex session inspect "$REX_SESSION" --json | jq -e --arg name "$name" '.label == $name' >/dev/null
    or begin
        echo 'rex-name-session: could not verify the session name' >&2
        return 1
    end
end
