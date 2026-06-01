function wt --description "Create or jump to a git worktree for a branch"
    set -l branch $argv[1]

    if test -z "$branch"
        git worktree list
        return $status
    end

    set -l repo_root (git rev-parse --show-toplevel 2>/dev/null)
    if test -z "$repo_root"
        echo "wt: not inside a git repository" >&2
        return 1
    end

    set -l repo_name (basename "$repo_root")
    set -l branch_slug (string replace -a / - "$branch")
    set -l worktree_root ~/dd/.worktrees
    set -l worktree_path "$worktree_root/$repo_name-$branch_slug"
    set -l branch_ref "refs/heads/$branch"

    set -l existing_worktree (git worktree list --porcelain | awk -v branch="$branch_ref" '
        $1 == "worktree" { path = $2 }
        $1 == "branch" && $2 == branch { print path }
    ')

    if test -n "$existing_worktree"
        cd "$existing_worktree"
        return
    end

    mkdir -p "$worktree_root"
    git worktree add "$worktree_path" "$branch"
    or return $status

    cd "$worktree_path"
end
