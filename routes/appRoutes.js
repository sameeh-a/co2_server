const express = require("express");
const router = express.Router();

router.get("/app-data", (req, res) => {
  const currentTime = new Date();

  const generateTimestamps = () => {
    return Array.from({ length: 5 }, (_, i) => {
      const time = new Date(currentTime);
      time.setMinutes(currentTime.getMinutes() - (4 - i) * 10);
      return time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    });
  };

  const timestamps = generateTimestamps();

  const appData = [
    {
      appName: "App 1",
      carbonEmissionData: timestamps.map((time) => ({
        timestamp: time,
        emission: (Math.random() * 0.003).toFixed(6),
      })),
      cpuUsage: "1.8",
      suggestedShutdown: "02:00 AM",
      suggestedRestart: "06:00 AM",
      idle: "10.0", // Fixed percentage
      transaction: "50.0", // Fixed percentage
      weekend: "40.0", // Fixed percentage
    },
    {
      appName: "App 2",
      carbonEmissionData: timestamps.map((time) => ({
        timestamp: time,
        emission: (Math.random() * 0.004).toFixed(6),
      })),
      cpuUsage: "2.1",
      suggestedShutdown: "01:00 AM",
      suggestedRestart: "05:30 AM",
      idle: "10.0",
      transaction: "55.0",
      weekend: "35.0",
    },
    {
      appName: "App 3",
      carbonEmissionData: timestamps.map((time) => ({
        timestamp: time,
        emission: (Math.random() * 0.0025).toFixed(6),
      })),
      cpuUsage: "1.5",
      suggestedShutdown: "12:30 AM",
      suggestedRestart: "04:45 AM",
      idle: "10.0",
      transaction: "60.0",
      weekend: "30.0",
    },
  ];

  res.json(appData);
});

module.exports = router;
