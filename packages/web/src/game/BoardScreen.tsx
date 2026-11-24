import { PhoneBoard } from './board/PhoneBoard.js';
import { SharedBoard } from './board/SharedBoard.js';
import type { ScreenProps } from './useGame.js';

export function BoardScreen({ you, ...props }: ScreenProps & { you: string | null }) {
  const view = props.update.view;
  if (!view) return null;
  return you ? <PhoneBoard {...props} you={you} view={view} /> : <SharedBoard {...props} view={view} />;
}
