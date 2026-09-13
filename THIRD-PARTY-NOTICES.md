# Third-party notices

This package is distributed under the MIT License (see `LICENSE`) and includes
third-party code identified below.

---

## Sourcegraph search-query modules

`dist/vendor/sourcegraph-query/` is compiled from Sourcegraph's TypeScript
client, copied from `client/shared/src/search/query/`.

| Field | Value |
|---|---|
| Repository | https://github.com/sourcegraph/sourcegraph-public-snapshot |
| Commit | `c864f15af264f0f456a6d8a83290b5c940715349` (2024-08-22) |
| Upstream manifest license | Apache-2.0 (`client/shared/package.json`) |

**License note.** Upstream declares Apache-2.0 in the package manifest, while the
repository root applies the Sourcegraph Enterprise License to all files "except
for files in or under any directory that contains a superseding license file."
No such file exists under `client/shared/` — it contains only a third-party
`NOTICE` — and the repository's license metadata is `NOASSERTION`. Both readings
are defensible. The maintainers of this package proceed under the manifest's
Apache-2.0 declaration and record the ambiguity here rather than resolving it
silently. This should be revisited before any public release.

The upstream files are **modified**, not verbatim. The changes are: import
specifier rewriting; three imports that pointed outside the tree replaced with
local shims; one narrowing fix in `scanner.ts`; and a change-notice header on
each edited file. Every modification is listed in
`vendor/sourcegraph-query/PROVENANCE.md`, which ships with this package for that
reason.

Each edited file carries a prominent notice stating that it was changed — in the
source **and in the emitted JavaScript**, because `tsc` drops a file-leading
comment when the statement after it is elided, and a notice that does not survive
the build is not a notice. Apache-2.0 section 4(b) requires the notice and
section 4(d) requires this file's contents to be retained alongside the code.

The vendored tree is not currently imported by the plugin's runtime code; it is
carried for query validation and future tools. That does not change the
obligations above, and it is stated here so a redistributor is not misled about
why Apache-2.0 code is present.

Full upstream license texts follow.

---

## Sourcegraph Enterprise License (repository root `LICENSE`)

The Sourcegraph Enterprise license (the “Enterprise License”)
Copyright (c) 2018-present Sourcegraph Inc.

With regard to the Sourcegraph Software:

This software and associated documentation files (the "Software") may only be
used in production, if you (and any entity that you represent) have agreed to,
and are in compliance with, the Sourcegraph Terms of Service, available
at https://sourcegraph.com/terms (the “Enterprise Terms”), or other
agreement governing the use of the Software, as agreed by you and Sourcegraph,
and otherwise have a valid Sourcegraph Enterprise subscription for the
correct number of user seats. Subject to the foregoing sentence, you are free to
modify this Software and publish patches to the Software. You agree that Sourcegraph
and/or its licensors (as applicable) retain all right, title and interest in and
to all such modifications and/or patches, and all such modifications and/or
patches may only be used, copied, modified, displayed, distributed, or otherwise
exploited with a valid Sourcegraph Enterprise subscription for the correct
number of user seats. Notwithstanding the foregoing, you may copy and modify
the Software for development and testing purposes, without requiring a
subscription. You agree that Sourcegraph and/or its licensors (as applicable) retain
all right, title and interest in and to all such modifications. You are not
granted any other rights beyond what is expressly stated herein. Subject to the
foregoing, it is forbidden to copy, merge, publish, distribute, sublicense,
and/or sell the Software.

The full text of this Enterprise License shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

For all third party components incorporated into the Sourcegraph Software, those
components are licensed under the original license provided by the owner of the
applicable component.

---

## Upstream `client/shared/NOTICE` (third-party attributions)

This project incorporates material from the sources listed below.

-------------------------------------------------------------------------------
## https://github.com/Microsoft/vscode
## https://github.com/Microsoft/vscode-languageserver-node

MIT License

Copyright (c) 2015 - present Microsoft Corporation

All rights reserved.

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
-------------------------------------------------------------------------------

# https://github.com/ariya/tapdigit

Copyright (c) 2018, Ariya Hidayat. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.