import { createContext, useContext } from 'react';
import type { Me } from './api';

export const SessionContext = createContext<{ me: Me; signOut: () => void } | null>(null);

export function useSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside SessionContext');
  return s;
}
