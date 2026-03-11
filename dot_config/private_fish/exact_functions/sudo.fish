function sudo --wraps='/Applications/Privileges.app/Contents/MacOS/PrivilegesCLI -a && /usr/bin/sudo' --description 'alias sudo /Applications/Privileges.app/Contents/MacOS/PrivilegesCLI -a && /usr/bin/sudo'
    /Applications/Privileges.app/Contents/MacOS/PrivilegesCLI -a && /usr/bin/sudo $argv
end
