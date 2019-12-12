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
plugins=(git git-extras aws osx kubectl fzf)

source $ZSH/oh-my-zsh.sh

# Fix locale issues
export LC_CTYPE="en_US.UTF-8"

# User PATH
export PATH="/usr/local/bin:$HOME/bin:$PATH"

# cURL
export PATH="/usr/local/opt/curl/bin:$PATH"

# GO
export GOPATH="${HOME}/go"
export GOROOT="$(brew --prefix golang)/libexec"
export PATH="$PATH:${GOPATH}/bin:${GOROOT}/bin"

test -d "${GOPATH}" || mkdir "${GOPATH}"
test -d "${GOPATH}/src/github.com" || mkdir -p "${GOPATH}/src/github.com"

# Ruby with RVM to PATH for scripting.
export PATH="${PATH}:${HOME}/.rvm/bin"
test -f "${HOME}/.rvm/scripts/rvm" && source "${HOME}/.rvm/scripts/rvm"

# AWS
export AWS_REGION="eu-west-1"

alias zshconfig="code ~/.zshrc"
alias brewup="brew update && brew upgrade && brew cleanup"
alias yat="bat -l yaml"

gi() {
    curl -L -s "https://www.gitignore.io/api/$@"
}

git-update-fork() {
    git fetch upstream && git checkout master && git merge upstream/master
}

python3-env() {
    python3 -m venv .env
}

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

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
