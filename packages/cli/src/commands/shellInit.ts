import { Command } from 'commander';

/**
 * A child process can't cd its parent shell, so `stx wt` needs a shell-side
 * wrapper. This prints one for zsh/bash; add `eval "$(stx shell-init)"` to your
 * rc file.
 *
 * The wrapper passes a scratch file to the binary and cds to whatever path the
 * binary writes there (see utils/cd.ts). Everything else about the call is
 * untouched — stdout and stderr stay attached to the terminal, so prompts and
 * progress output still stream — and `stx`'s exit status is preserved.
 *
 * Deliberately no bare `wt` function: zer0's shell-init already defines one,
 * and whichever rc line ran last would silently win.
 */
const SCRIPT = `stx() {
  local __stx_cd __stx_dir __stx_status
  __stx_cd="$(mktemp "\${TMPDIR:-/tmp}/stxcd.XXXXXX")" || { command stx "$@"; return $?; }
  STX_CD_FILE="$__stx_cd" command stx "$@"
  __stx_status=$?
  __stx_dir="$(cat "$__stx_cd" 2>/dev/null)"
  rm -f "$__stx_cd"
  if [ -n "$__stx_dir" ] && [ -d "$__stx_dir" ]; then
    cd "$__stx_dir" || return $?
  fi
  return $__stx_status
}
`;

export const shellInitCommand = new Command('shell-init')
  .description('Print the shell function that lets `stx wt` cd your shell')
  .action(() => {
    console.log(SCRIPT);
  });
