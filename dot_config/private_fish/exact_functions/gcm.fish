function gcm
    git checkout "$(git symbolic-ref refs/remotes/origin/HEAD | awk -F'/' '{print $NF}')"
end
