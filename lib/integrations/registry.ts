import type { IntegrationCategory, IntegrationAdapter } from './types';

type AdapterFactory = () => IntegrationAdapter;

const registry = new Map<string, AdapterFactory>();

function key(category: string, provider: string): string {
  return `${category}::${provider}`;
}

export function registerAdapter(category: IntegrationCategory, provider: string, factory: AdapterFactory) {
  registry.set(key(category, provider), factory);
}

export function getAdapter(category: IntegrationCategory, provider: string): IntegrationAdapter | null {
  const factory = registry.get(key(category, provider));
  if (!factory) return null;
  return factory();
}

export function getAvailableProviders(category: IntegrationCategory): string[] {
  const prefix = `${category}::`;
  const providers: string[] = [];
  for (const k of Array.from(registry.keys())) {
    if (k.startsWith(prefix)) {
      providers.push(k.slice(prefix.length));
    }
  }
  return providers;
}

export function getAvailableCategories(): IntegrationCategory[] {
  const categories = new Set<IntegrationCategory>();
  for (const k of Array.from(registry.keys())) {
    categories.add(k.split('::')[0] as IntegrationCategory);
  }
  return Array.from(categories);
}
