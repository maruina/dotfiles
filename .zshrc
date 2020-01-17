#!/bin/zsh
# Path to your oh-my-zsh installation.
export ZSH=$HOME/.oh-my-zsh

# Set name of the theme to load.
# Look in ~/.oh-my-zsh/themes/
# Optionally, if you set this to "random", it'll load a random theme each
# time that oh-my-zsh is loaded.
ZSH_THEME=powerlevel10k/powerlevel10k

# Which plugins would you like to load? (plugins can be found in ~/.oh-my-zsh/plugins/*)
# Custom plugins may be added to ~/.oh-my-zsh/custom/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
# Add wisely, as too many plugins slow down shell startup.
plugins=(git git-extras aws osx kubectl fzf helm)

source $ZSH/oh-my-zsh.sh

# History
# https://stackoverflow.com/questions/32057760/is-it-possible-to-not-share-history-between-panes-windows-in-tmux-with-zsh
setopt nosharehistory
# https://leetschau.github.io/remove-duplicate-zsh-history.html
setopt EXTENDED_HISTORY          # Write the history file in the ":start:elapsed;command" format.
setopt INC_APPEND_HISTORY        # Write to the history file immediately, not when the shell exits.
setopt HIST_EXPIRE_DUPS_FIRST    # Expire duplicate entries first when trimming history.
setopt HIST_IGNORE_DUPS          # Don't record an entry that was just recorded again.
setopt HIST_IGNORE_ALL_DUPS      # Delete old recorded entry if new entry is a duplicate.
setopt HIST_FIND_NO_DUPS         # Do not display a line previously found.
setopt HIST_IGNORE_SPACE         # Don't record an entry starting with a space.
setopt HIST_SAVE_NO_DUPS         # Don't write duplicate entries in the history file.
setopt HIST_REDUCE_BLANKS        # Remove superfluous blanks before recording entry.
setopt HIST_VERIFY               # Don't execute immediately upon history expansion.

# Fix locale issues
export LC_CTYPE="en_US.UTF-8"

# User PATH
export PATH="/usr/local/bin:$HOME/bin:$PATH"

# cURL
export PATH="/usr/local/opt/curl/bin:$PATH"

# GO
export GOPATH="$HOME/go"
export GOROOT="$(brew --prefix golang)/libexec"
export PATH="$PATH:$GOPATH/bin:$GOROOT/bin"

test -d "$GOPATH" || mkdir "$GOPATH"
test -d "$GOPATH/src/github.com" || mkdir -p "$GOPATH/src/github.com"

# Rust
export PATH="$PATH:$HOME/.cargo/bin"

# Ruby with RVM to PATH for scripting.
export PATH="$PATH:$HOME/.rvm/bin"
test -f "$HOME/.rvm/scripts/rvm" && source "$HOME/.rvm/scripts/rvm"

# https://github.com/kubernetes-sigs/krew
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"

# AWS
export AWS_REGION="eu-west-1"

# added by travis gem
if [[ -f $HOME/.travis/travis.sh ]]; then
    source $HOME/.travis/travis.sh
fi

# Private credentials
if [[ -f $HOME/.private ]]; then
    source $HOME/.private
fi

# Extra configurations
if [[ -f $HOME/.extras ]]; then
    source $HOME/.extras
fi

# Aliases
if [[ -f $HOME/.aliases ]]; then
    source $HOME/.aliases
fi

# Functions
if [[ -f $HOME/.functions ]]; then
    source $HOME/.functions
fi

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
