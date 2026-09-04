"use client";

import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { useEffect } from "react";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
      capture_pageview: false, // We handle this manually
      capture_pageleave: true,
      autocapture: true,
      capture_exceptions: true, // Enable exception autocapture
      session_recording: {
        maskTextSelector: ".ph-mask", // Mask elements with this class
        recordCrossOriginIframes: false,
      },
      person_profiles: "identified_only",
    });
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

export function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname;
      if (searchParams.toString()) {
        url = url + `?${searchParams.toString()}`;
      }
      posthog.capture("$pageview", {
        $current_url: url,
      });
    }
  }, [pathname, searchParams, posthog]);

  return null;
}
