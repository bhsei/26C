// Run every 1 minute (60000 milliseconds)
setInterval(() => {
  // Node 18+ has native fetch, pinging the local Next.js server
  fetch("http://localhost:3000/api/notifications", { 
    headers: { "x-cron-secret": process.env.CRON_SECRET || "" } 
  })
    .then(res => res.json())
    .catch(() => {
      // Silently catches errors if Next.js is still starting up or compiling
    });
}, 60000);