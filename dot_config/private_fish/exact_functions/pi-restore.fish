function pi-restore --description 'Preview or restore saved Rex Pi sessions'
    set -l agent_dir "$HOME/.pi/agent"
    if set -q PI_CODING_AGENT_DIR
        set agent_dir "$PI_CODING_AGENT_DIR"
    end
    command node "$agent_dir/extensions/rex-recovery/cli.mjs" $argv
end
