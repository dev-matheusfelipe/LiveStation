"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdSenseUnitProps = {
  slot?: string;
  className?: string;
};

export function AdSenseUnit({ slot, className }: AdSenseUnitProps) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const canRender = Boolean(client && slot);

  useEffect(() => {
    if (!canRender) {
      return;
    }
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      // Ignore ad push errors to avoid breaking UI.
    }
  }, [canRender, slot]);

  if (!canRender) {
    return null;
  }

  return (
    <div className={className}>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
