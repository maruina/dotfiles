#!/bin/bash

sync() {
    echo "applies dotfile locally"
    rsync --exclude ".git/" \
        --exclude ".DS_Store" \
        --exclude "sync.sh" \
        --exclude "README.md" \
        --exclude ".pre-commit-config.yaml" \
        -avh \
        --no-perms \
        . "${HOME}"
}

# Update repository before syncing
git pull origin master

# Update local dotfiles
sync
