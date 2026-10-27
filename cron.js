// cron.js
// This script runs alongside Next.js and acts as the "heartbeat" to trigger notifications.

console.log("⏱️ Background Cron Job started...");

// Run every 1 minute (60000 milliseconds)
setInterval(() => {
  // Node 18+ has native fetch, so we just ping the local Next.js server
  console.log("Running notifications script");
  fetch("http://localhost:3000/api/notifications")
    .then(res => res.json())
    .then(data => {
      if (data.openingRemindersSent > 0 || data.alreadyOpenRemindersSent > 0 || data.closingRemindersSent > 0) {
        console.log("🔔 Notifications sent:", data);
      }
    })
    .catch(err => {
      // It might fail if Next.js is still compiling, which is fine.
      console.log("Cron waiting for Next.js server to be ready...");
    });
}, 60000);
