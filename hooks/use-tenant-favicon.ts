import { useEffect } from 'react';

export function useTenantFavicon(logoUrl: string | null | undefined) {
  useEffect(() => {
    if (!logoUrl) return;

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const original = link?.href || '/favicon.ico';

    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }

    link.href = logoUrl;

    return () => {
      if (link) link.href = original;
    };
  }, [logoUrl]);
}
