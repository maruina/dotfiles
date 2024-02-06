#!/bin/zsh
# Path to your oh-my-zsh installation.
export ZSH=$HOME/.oh-my-zsh

# Which plugins would you like to load? (plugins can be found in ~/.oh-my-zsh/plugins/*)
# Custom plugins may be added to ~/.oh-my-zsh/custom/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
# Add wisely, as too many plugins slow down shell startup.
plugins=(git git-extras macos fzf aws)

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
# tab completion
setopt hash_list_all

# https://docs.brew.sh/Shell-Completion
if type brew &>/dev/null
then
  FPATH="$(brew --prefix)/share/zsh/site-functions:${FPATH}"

  autoload -Uz compinit
  compinit
fi

# https://stackoverflow.com/a/14900496/8514646
bindkey '^i' expand-or-complete-prefix

# Fix locale issues
export LANG="en_US.UTF-8"
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

# Pyenv
# export PATH="$(pyenv root)/shims:$PATH"
# eval "$(pyenv init -)"
# eval "$(pyenv virtualenv-init -)"

# Ruby with RVM to PATH for scripting.
export PATH="$PATH:$HOME/.rvm/bin"
test -f "$HOME/.rvm/scripts/rvm" && source "$HOME/.rvm/scripts/rvm"

# https://github.com/kubernetes-sigs/krew
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"

# AWS
# https://stackoverflow.com/questions/60122188/how-to-turn-off-the-pager-for-aws-cli-return-value
export AWS_PAGER=""
# store key in the login keychain instead of aws-vault managing a hidden keychain
export AWS_VAULT_KEYCHAIN_NAME=login
# tweak session times so you dont have to re-enter passwords every 5min
export AWS_SESSION_TTL=24h
export AWS_ASSUME_ROLE_TTL=24h

# AWS Session Manager
export PATH="$PATH:/usr/local/sessionmanagerplugin/bin"

# Kubebuilder
export PATH=$PATH:/usr/local/kubebuilder/bin

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

# k alias autocomplete
source <(kubectl completion zsh)
complete -F __start_kubectl k

# zoxide
eval "$(zoxide init zsh)"

# Helm
source <(helm completion zsh)

# kubectl krew
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"

# FZF
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

source /usr/local/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# Atuin
eval "$(atuin init zsh)"

# https://starship.rs/
eval "$(starship init zsh)"

