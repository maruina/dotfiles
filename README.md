# dotfiles

Collection of public dotfiles

## Usage

`sync.sh` will replace the dotfiles in your `$HOME` with the ones in the repository. There will be no prompt, so use at your own risks.

```bash
git clone git@github.com:maruina/dotfiles.git
cd dotfiles
./sync.sh
```

### Custom and private settings

`zsh` will source, if they exists, the following files:

- `.private`, where to private tokens and credentials
- `.extras`, where to store custom configuration like GIT_AUTHOR_NAME, etc.

## Credits

Heavily copied and pasted from [https://github.com/mathiasbynens/dotfiles](https://github.com/mathiasbynens/dotfiles)
