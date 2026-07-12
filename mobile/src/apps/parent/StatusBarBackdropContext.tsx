// Android no longer lets apps paint a background behind the status bar
// (edge-to-edge is enforced), so ParentApp paints its own backdrop rectangle
// over the top safe-area inset, above the navigator. Every screen gets the
// same danfo-yellow strip by default — except the Track screen, which wants
// the map to bleed under the status bar with a black strip instead. This
// context lets one screen override the color while focused, without every
// other screen needing to know about it.
import { createContext, useContext } from 'react';

type StatusBarBackdropContextValue = {
  setColor: (color: string | null) => void;
};

export const StatusBarBackdropContext = createContext<StatusBarBackdropContextValue>({
  setColor: () => {},
});

export function useStatusBarBackdrop(): StatusBarBackdropContextValue {
  return useContext(StatusBarBackdropContext);
}
