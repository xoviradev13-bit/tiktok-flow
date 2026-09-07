/**
 * Module augmentation for lucide-react brand icons that were removed in v1.x.
 * Maps missing brand icons to semantically similar available icons.
 */
import type { LucideIcon } from "lucide-react";

declare module "lucide-react" {
  export const Github: LucideIcon;
  export const Slack: LucideIcon;
  export const Linkedin: LucideIcon;
  export const Twitter: LucideIcon;
  export const Facebook: LucideIcon;
  export const Instagram: LucideIcon;
  export const Figma: LucideIcon;
  export const Youtube: LucideIcon;
}
