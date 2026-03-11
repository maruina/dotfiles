function brew
        set -l priv_commands install update upgrade uninstall cleanup reinstall doctor config
        if contains -- $argv[1] $priv_commands
                if isatty stdout
                        if not string match -q -r "\b(admin|wheel)\b" (/usr/bin/groups)
                                if /Applications/Privileges.app/Contents/MacOS/PrivilegesCLI -a
                                        sleep 1
                                else
                                        echo "PrivilegesCLI failed to elevate. Aborting brew command." >&2
                                        return 1
                                end
                        end
                end
        end
        command brew $argv
        return $status
end
