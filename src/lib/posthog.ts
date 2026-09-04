import { PostHog } from "posthog-node";

let posthog: PostHog | null = null;

export function getPostHog(): PostHog {
  if (!posthog) {
    posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
    });
  }
  return posthog;
}
