function hx --description "Open hx"
    if test (count $argv) -eq 0
        command hx
    else
        chezmoi verify $argv[1] &> /dev/null && chezmoi edit --watch --hardlink=false $argv[1] || command hx $argv
    end
end