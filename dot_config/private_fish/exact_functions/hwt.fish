function hwt --description "Create or open a Herdr workspace for a git worktree branch"
    set -l branch $argv[1]

    if test -z "$branch"
        herdr worktree list
        return $status
    end

    set -l repo_root (git rev-parse --show-toplevel 2>/dev/null)
    if test -z "$repo_root"
        echo "hwt: not inside a git repository" >&2
        return 1
    end

    # herdr worktree create lays out <~/dd/.worktrees>/<repo>/<slug> with the
    # same slug rule (lowercase, slash -> dash) as wt.fish, so both tools land
    # in the same checkout for a given branch.
    #
    # open_workspace_id tells us whether a Herdr space is already open for the
    # worktree: focus it instead of opening a duplicate (herdr worktree open
    # always opens a fresh space and closes the previous one).
    set -l open_ws (herdr worktree list --cwd "$repo_root" \
        | jq -r '.result.worktrees[] | select(.branch == $branch) | (.open_workspace_id // "none")' --arg branch "$branch")

    if test -n "$open_ws"
        if test "$open_ws" = none
            herdr worktree open --cwd "$repo_root" --branch "$branch"
        else
            herdr workspace focus "$open_ws"
        end
        return $status
    end

    # No worktree for this branch yet. herdr worktree create would silently
    # create the branch if it is missing; require it to exist first, matching
    # wt.fish (which errors via `git worktree add <path> <branch>`).
    if not git rev-parse --verify --quiet "refs/heads/$branch"
        echo "hwt: branch '$branch' does not exist" >&2
        return 1
    end

    herdr worktree create --cwd "$repo_root" --branch "$branch"
end
