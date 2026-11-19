# Worktrunk Pi activity extension
The extension starts from [Worktrunk `dev/pi-extension.ts`](https://github.com/max-sixty/worktrunk/blob/8253cb57fc181affd4f8dd25b14149bc8ff61b97/dev/pi-extension.ts), version 0.82.0, commit `8253cb57fc181affd4f8dd25b14149bc8ff61b97`. The installed upstream file has SHA-256 `55083d7e2055c474f7d87ccad4f28bfbd1a8019ce03ff835952155b63075ef5b`.

The local extension adds a five-second timeout to each marker command because Pi waits for the event handlers. Pi can send SIGKILL five seconds after the timeout if the command does not exit on SIGTERM.

Worktrunk stores one marker per branch. Concurrent Pi sessions on the same branch can overwrite or clear each other's markers. A process killed without shutdown can leave a stale marker.

To refresh the extension, install it into a temporary `PI_CODING_AGENT_DIR` with `wt config plugins pi install --yes`. Record the new upstream version, commit, and hash. Reapply the timeout and run `node --experimental-strip-types --test exact_extensions/worktrunk/activity.test.ts` from `dot_pi/agent`.

## License
The upstream file is available under the MIT license:

```text
MIT License

Copyright (c) 2025 Maximilian Roos

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
