if command -q wt
    # The alternate initializer otherwise searches for a git-wt binary.
    if not set -q WORKTRUNK_BIN
        set -g WORKTRUNK_BIN (command -s wt)
    end
    command wt config shell init --cmd git-wt fish | source
end
