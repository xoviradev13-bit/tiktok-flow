"use client";

import dynamic from "next/dynamic";
import type { LucideProps } from "lucide-react";
import { HelpCircle } from "lucide-react";
import { useMemo } from "react";

type IconComponent = React.ComponentType<LucideProps>;

const iconModuleCache = new Map<string, Promise<{ default: IconComponent }>>();

function loadIconModule(name: string): Promise<{ default: IconComponent }> | null {
  const cached = iconModuleCache.get(name);
  if (cached) return cached;

  const kebab = name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();

  const loader = import(`lucide-react/dist/esm/icons/${kebab}.js`)
    .then((mod) => ({ default: mod.default as IconComponent }))
    .catch(() => null);

  if (!loader) return null;
  iconModuleCache.set(name, loader as Promise<{ default: IconComponent }>);
  return loader as Promise<{ default: IconComponent }>;
}

const componentCache = new Map<string, IconComponent>();

function getCachedIconComponent(name: string): IconComponent | null {
  if (componentCache.has(name)) return componentCache.get(name)!;

  const DynamicIcon = dynamic(
    () =>
      loadIconModule(name)?.then((mod) => mod ?? { default: HelpCircle }) ??
      Promise.resolve({ default: HelpCircle }),
    { ssr: false, loading: () => null }
  ) as IconComponent;

  componentCache.set(name, DynamicIcon);
  return DynamicIcon;
}

export interface DynamicLucideIconProps extends LucideProps {
  name: string;
}

/** Renders a Lucide icon by PascalCase name without importing the full icon set. */
export function DynamicLucideIcon({ name, ...props }: DynamicLucideIconProps) {
  const Icon = useMemo(() => getCachedIconComponent(name), [name]);
  if (!Icon) return <HelpCircle {...props} />;
  return <Icon {...props} />;
}

export function resolveLucideIcon(name: string): IconComponent | null {
  return getCachedIconComponent(name);
}
