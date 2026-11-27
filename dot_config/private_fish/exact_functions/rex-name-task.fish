function rex-name-task --description 'Label this Rex tab, or this pane when the tab is split'
    if test (count $argv) -ne 1; or not string match -qr '^π-[a-z0-9]+(-[a-z0-9]+){1,3}$' -- "$argv[1]"
        echo 'Usage: rex-name-task π-review-pr-123 (2–4 hyphen-separated parts, lowercase letters or digits)' >&2
        return 2
    end
    if test -z "$REX_BLOCK"
        echo 'rex-name-task: REX_BLOCK is required' >&2
        return 1
    end
    set -l session_ref "$REX_SESSION"
    if test -z "$session_ref"
        set session_ref "$REX_BLOCK"
    end
    set -l label "$argv[1]"
    set -l block (rex block inspect -s "$session_ref" "$REX_BLOCK" --json | string collect)
    or return 1
    set -l window (printf '%s' "$block" | jq -er '.block.window_id')
    or return 1
    set -l snapshot (rex session inspect "$session_ref" --json | string collect)
    or return 1
    set -l panes (printf '%s' "$snapshot" | jq -er --arg window "$window" --arg block "$REX_BLOCK" '.windows[] | select(.window_id == $window) | [.layers[].blocks[].block_id] | select(index($block) != null) | length')
    or return 1
    # deliberate: any split tab keeps its name; agent detection can narrow this later.
    if test "$panes" -gt 1
        rex block rename -s "$session_ref" "$REX_BLOCK" "$label"
        or return 1
        rex session inspect "$session_ref" --json | jq -e --arg block "$REX_BLOCK" --arg label "$label" 'any(.windows[].layers[].blocks[]; .block_id == $block and .label == $label)' >/dev/null
    else
        rex window rename -s "$session_ref" "$window" "$label"
        or return 1
        rex session inspect "$session_ref" --json | jq -e --arg window "$window" --arg label "$label" 'any(.windows[]; .window_id == $window and .label == $label)' >/dev/null
    end
    or begin
        echo 'rex-name-task: could not verify the task label' >&2
        return 1
    end
end
