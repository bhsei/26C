'use client';

import { useState, useEffect } from 'react';

export default function LocalClock({ timeZone }: { timeZone?: string }) {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    // Update time immediately after component mounts
    const updateTime = () => {
      setTime(new Date().toLocaleTimeString());
    };
    updateTime();

    // Update every second
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="font-mono text-blue-700">
      {/*  render a placeholder so both outputs match and hydration stays in sync */}
      <div>{time ?? '--:--:--'}</div>
      <div className="text-xs text-blue-500">{timeZone}</div>
    </div>
  );
}