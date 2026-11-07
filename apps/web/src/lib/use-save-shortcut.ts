import { useEffect, useRef } from 'react';

/** Ctrl/⌘+S runs `save` (document editors). Skipped while `disabled` (e.g. a save is in flight). */
export function useSaveShortcut(save: () => void, disabled = false) {
  const latest = useRef(save);
  latest.current = save;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!disabled) latest.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disabled]);
}
