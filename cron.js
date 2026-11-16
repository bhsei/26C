/* eslint-disable @typescript-eslint/no-require-imports */
require("dotenv").config();

// Run every 1 minute (60000 milliseconds)
setInterval(() => {
  // Node 18+ has native fetch, pinging the local Next.js server
  fetch("http://localhost:3000/api/notifications", { 
    headers: { "x-cron-secret": process.env.CRON_SECRET || "" } 
  })
    .then(async (res) => {
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error(`Scheduler endpoint returned HTTP ${res.status}:`, result);
        return;
      }
      if (result.automaticPricesAdjusted > 0) {
        console.log(`Automatically adjusted ${result.automaticPricesAdjusted} listing price(s).`);
      }
    })
    .catch((error) => {
      // The Next.js server may still be starting up or compiling.
      console.warn("Scheduler could not reach the application:", error instanceof Error ? error.message : error);
    });
}, 60000);
