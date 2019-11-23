#!/bin/bash

sync() {
    echo "applies dotfile locally"
    rsync --exclude ".git/" \
	    --exclude ".DS_Store" \
		--exclude "sync.sh" \
		--exclude "README.md" \
		-avh \
        --no-perms \
        . "${HOME}"
}

sync