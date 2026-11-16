rex.bind("ctrl+b>shift+\\", "pane.split", { direction = "right" })
rex.bind("ctrl+b>-", "pane.split", { direction = "down" })
rex.bind("ctrl+b>r", "client.config.reload")
rex.bind("ctrl+b>ctrl+b", "pane.send_key", { key = "ctrl+b" })
