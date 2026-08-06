'use client';

import { useEffect, useCallback, useRef } from 'react';

export type EmbedMessage =
  | { type: 'OPERAN_EMBED_READY'; height: number }
  | { type: 'OPERAN_EMBED_RESIZE'; height: number }
  | { type: 'OPERAN_BOOKING_STEP_CHANGED'; step: string }
  | { type: 'OPERAN_BOOKING_COMPLETED'; reservationId: string; status: string; bookingReference: string }
  | { type: 'OPERAN_EMBED_CLOSE' };

const ALLOWED_MESSAGE_TYPES = new Set([
  'OPERAN_EMBED_READY',
  'OPERAN_EMBED_RESIZE',
  'OPERAN_BOOKING_STEP_CHANGED',
  'OPERAN_BOOKING_COMPLETED',
  'OPERAN_EMBED_CLOSE',
]);

export function isAllowedEmbedMessage(data: unknown): data is EmbedMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  return typeof msg.type === 'string' && ALLOWED_MESSAGE_TYPES.has(msg.type);
}

export function useEmbedPostMessage(isEmbed: boolean) {
  const hasSentReady = useRef(false);

  const sendMessage = useCallback((msg: EmbedMessage) => {
    if (!isEmbed || typeof window === 'undefined') return;
    try {
      window.parent.postMessage({ ...msg, source: 'operan-embed' }, '*');
    } catch {
      // parent may be unreachable in some contexts
    }
  }, [isEmbed]);

  const sendReady = useCallback((height?: number) => {
    if (hasSentReady.current) return;
    hasSentReady.current = true;
    sendMessage({ type: 'OPERAN_EMBED_READY', height: height || document.body.scrollHeight });
  }, [sendMessage]);

  const sendResize = useCallback((height?: number) => {
    sendMessage({ type: 'OPERAN_EMBED_RESIZE', height: height || document.body.scrollHeight });
  }, [sendMessage]);

  const sendStepChanged = useCallback((step: string) => {
    sendMessage({ type: 'OPERAN_BOOKING_STEP_CHANGED', step });
  }, [sendMessage]);

  const sendBookingCompleted = useCallback((reservationId: string, status: string, bookingReference: string) => {
    sendMessage({ type: 'OPERAN_BOOKING_COMPLETED', reservationId, status, bookingReference });
  }, [sendMessage]);

  const sendClose = useCallback(() => {
    sendMessage({ type: 'OPERAN_EMBED_CLOSE' });
  }, [sendMessage]);

  // Auto-resize observer
  useEffect(() => {
    if (!isEmbed || typeof window === 'undefined') return;

    const sendCurrentHeight = () => {
      const height = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight,
      );
      sendResize(height);
    };

    // Send ready immediately
    sendReady();

    // Observe DOM mutations for height changes
    const observer = new MutationObserver(() => sendCurrentHeight());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    // Also poll periodically as a fallback (images loading, async content)
    const interval = setInterval(sendCurrentHeight, 1000);

    // Resize on window resize
    window.addEventListener('resize', sendCurrentHeight);

    return () => {
      observer.disconnect();
      clearInterval(interval);
      window.removeEventListener('resize', sendCurrentHeight);
    };
  }, [isEmbed, sendReady, sendResize]);

  return {
    sendReady,
    sendResize,
    sendStepChanged,
    sendBookingCompleted,
    sendClose,
  };
}
