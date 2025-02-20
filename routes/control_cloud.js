const express = require("express");
const AWS = require("aws-sdk");
require("dotenv").config();

const router = express.Router();
const REGION = process.env.AWS_REGION; // Ensure this is set in your .env file

AWS.config.update({ region: REGION });

const ec2 = new AWS.EC2(); // Create EC2 instance once instead of inside each function

// 🛑 Stop EC2 Instance
router.post("/stop", async (req, res) => {
  const { instanceId } = req.body;
  try {
    const params = { InstanceIds: [instanceId] };
    await ec2.stopInstances(params).promise();
    res.json({ message: `Instance ${instanceId} stopped successfully` });
  } catch (error) {
    console.error("Error stopping instance:", error.message);
    res.status(500).json({ error: "Error stopping instance" });
  }
});

// 🔄 Restart EC2 Instance
router.post("/restart", async (req, res) => {
  const { instanceId } = req.body;
  try {
    const params = { InstanceIds: [instanceId] };

    // Stop the instance first
    await ec2.stopInstances(params).promise();
    await ec2
      .waitFor("instanceStopped", { InstanceIds: [instanceId] })
      .promise();

    // Start the instance again
    await ec2.startInstances(params).promise();
    res.json({ message: `Instance ${instanceId} restarted successfully` });
  } catch (error) {
    console.error("Error restarting instance:", error.message);
    res.status(500).json({ error: "Error restarting instance" });
  }
});

module.exports = router;
