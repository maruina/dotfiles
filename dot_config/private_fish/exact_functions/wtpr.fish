function wtpr --description "Create or jump to a git worktree for a GitHub PR"
    set -l pr $argv[1]

    if test -z "$pr"
        echo "usage: wtpr <pr-number-or-url>" >&2
        return 2
    end

    set -l branch (gh pr view "$pr" --json headRefName --jq .headRefName 2>/dev/null)
    if test -z "$branch"
        echo "wtpr: could not resolve PR branch for $pr" >&2
        return 1
    end

    wt "$branch"
end
