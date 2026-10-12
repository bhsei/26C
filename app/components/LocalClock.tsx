"use client";

import { useEffect, useState } from "react";

export default function LocalClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(id);
  }, []);

  // Render placeholder on server
  if (!now) {
    return <span className="font-mono text-blue-500">--:--:--</span>;
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="font-mono text-blue-700">
      <div>{now.toLocaleTimeString()}</div>
      <div className="text-xs text-blue-500">{timeZone}</div>
    </div>
  );
}