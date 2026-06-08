function git-worktrees-gone --description "Remove clean git worktrees whose upstream branch is gone"
    set -l repo_root (git rev-parse --show-toplevel 2>/dev/null)
    if test -z "$repo_root"
        echo "git-worktrees-gone: not inside a git repository" >&2
        return 1
    end

    git fetch --all --prune
    or return $status

    set -l current_worktree (git rev-parse --show-toplevel 2>/dev/null)
    set -l worktree_path
    set -l removed 0
    set -l skipped 0

    git worktree list --porcelain | while read -l line
        if string match -q 'worktree *' -- "$line"
            set worktree_path (string replace -r '^worktree ' '' -- "$line")
            continue
        end

        if not string match -q 'branch refs/heads/*' -- "$line"
            continue
        end

        set -l branch (string replace 'branch refs/heads/' '' -- "$line")

        if test "$worktree_path" = "$current_worktree"
            echo "Skipping current worktree: $worktree_path ($branch)"
            set skipped (math $skipped + 1)
            continue
        end

        set -l status_line (git -C "$worktree_path" status -sb | head -n 1)
        if not string match -q '*[gone]*' -- "$status_line"
            continue
        end

        if test -n "$(git -C "$worktree_path" status --porcelain)"
            echo "Skipping dirty worktree: $worktree_path ($branch)" >&2
            set skipped (math $skipped + 1)
            continue
        end

        echo "Removing gone worktree: $worktree_path ($branch)"
        git worktree remove "$worktree_path"
        or begin
            set skipped (math $skipped + 1)
            continue
        end

        git branch -D "$branch"
        or begin
            set skipped (math $skipped + 1)
            continue
        end

        set removed (math $removed + 1)
    end

    git worktree prune

    echo "Removed $removed gone worktree(s), skipped $skipped."
end
