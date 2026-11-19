if command -q wt
    # The alternate initializer otherwise searches for a git-wt binary.
    if not set -q WORKTRUNK_BIN
        set -g WORKTRUNK_BIN (command -s wt)
    end
    command wt config shell init --cmd git-wt fish | source
    functions -c git-wt __worktrunk_git_wt

    function git-wt
        if not set -q WORKTREES_ROOT[1]; or test -z "$WORKTREES_ROOT"
            echo "git-wt: WORKTREES_ROOT is not set" >&2
            return 1
        end
        set -lx WORKTRUNK_WORKTREE_PATH "$WORKTREES_ROOT/{{ repo }}/{{ branch | replace('/', '-') | lower }}"
        __worktrunk_git_wt $argv
    end
end
