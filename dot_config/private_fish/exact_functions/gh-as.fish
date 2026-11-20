function gh-as --description 'Run supported gh queries with the selected GitHub account'
    if test (count $argv) -lt 3
        echo 'gh-as: expected account or owner/repo and a supported command' >&2
        return 2
    end

    set -l target $argv[1]
    set -e argv[1]
    set -l login
    set -l repo
    if contains -- $target maruina matteo-ruina_ddog
        set login $target
        if test (count $argv) -ne 2; or test "$argv[1]" != api; or test "$argv[2]" != user
            echo 'gh-as: account form supports only api user' >&2
            return 2
        end
    else
        set -l matches (string match -r '^(?:https://github\.com/)?([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?/?$' -- $target)
        if test (count $matches) -ne 3; or contains -- $matches[2] . ..; or contains -- $matches[3] . ..
            echo 'gh-as: expected a github.com owner/repo' >&2
            return 2
        end
        set repo "github.com/$matches[2]/$matches[3]"
        if contains -- (string lower $matches[2]) ddoghq ddoghq-sandbox
            set login matteo-ruina_ddog
        else
            set login maruina
        end
        if test "$argv[1]" != pr; or not contains -- $argv[2] view list
            echo 'gh-as: repository form supports pr view NUMBER or pr list' >&2
            return 2
        end
        if test "$argv[2]" = view
            if test (count $argv) -lt 3; or not string match -rq '^[1-9][0-9]*$' -- $argv[3]
                echo 'gh-as: pr view requires a numeric pull request number' >&2
                return 2
            end
        end
        set -l start 3
        if test "$argv[2]" = view
            set start 4
        end
        set -l i $start
        while test $i -le (count $argv)
            set -l arg $argv[$i]
            if string match -rq '^--(json|jq|template|limit|state|search|head|base|author|label|assignee|app)=.+' -- $arg
                set i (math $i + 1)
                continue
            end
            if not contains -- $arg --json --jq --template --limit --state --search --head --base --author --label --assignee --app
                echo 'gh-as: unsupported flag or argument' >&2
                return 2
            end
            set i (math $i + 1)
            if test $i -gt (count $argv); or string match -q -- '-*' $argv[$i]
                echo 'gh-as: missing flag value' >&2
                return 2
            end
            set i (math $i + 1)
        end
    end

    set -l token (env -u GH_TOKEN -u GITHUB_TOKEN gh auth token --hostname github.com --user $login 2>/dev/null)
    if test $status -ne 0; or test (count $token) -ne 1; or not string match -rq '^\S+$' -- "$token"
        echo 'gh-as: GitHub token unavailable for selected account' >&2
        return 1
    end
    set -lx GH_TOKEN $token
    set -lx GH_HOST github.com
    if test -n "$repo"
        set -lx GH_REPO $repo
        command gh $argv
    else
        env -u GH_REPO gh $argv
    end
    return $status
end
