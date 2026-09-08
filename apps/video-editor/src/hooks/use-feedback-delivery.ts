import { useRef, useState } from 'react';
import type { CollaborationTarget } from '@codex-ux/protocol';
import { api, post, videoPath } from '../lib/api';

export function useFeedbackDelivery(
  id: string,
  target: () => CollaborationTarget,
  refresh: () => Promise<unknown>,
) {
  const lock = useRef(false);
  const [sending, setSending] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');
  async function sendNotes(noteIds: string[], destination?: CollaborationTarget) {
    if (lock.current) return false;
    lock.current = true;
    setSending(true);
    setDeliveryError('');
    try {
      const captured = destination ?? target();
      const capability = await api<{ deliveryAvailable: boolean; detail: string }>('/agents/codex');
      if (!capability.deliveryAvailable)
        throw new Error(`${capability.detail} Your notes are saved and have not been sent.`);
      await post(`${videoPath(id)}/requests`, { noteIds, target: captured });
      return true;
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : 'Could not send notes.');
      return false;
    } finally {
      try {
        await refresh();
      } catch {
        setDeliveryError(
          'Could not refresh delivery status. Reopen Notes history before retrying.',
        );
      }
      lock.current = false;
      setSending(false);
    }
  }
  return { sending, deliveryError, sendNotes };
}
