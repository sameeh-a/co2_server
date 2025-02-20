require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const AWS = require("aws-sdk");
const cors = require("cors");
// const InstanceMetric = require("./models/Metrics");
const {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} = require("@aws-sdk/client-cloudwatch");
const {
  CostExplorerClient,
  GetCostAndUsageCommand,
} = require("@aws-sdk/client-cost-explorer");
const { EC2Client, DescribeInstancesCommand } = require("@aws-sdk/client-ec2");

const InstanceMetric = require("./models/Metrics");
const appRoutes = require("./routes/appRoutes");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", appRoutes);
AWS.config.update({ region: process.env.AWS_REGION });

const port = 3001;
const REGION = process.env.AWS_REGION || "us-east-1";

const cloudwatch = new CloudWatchClient({ region: REGION });
const costexplorer = new CostExplorerClient({ region: REGION });
const ec2 = new EC2Client({ region: REGION });

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/aws_metrics";
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

const instanceId = "i-0ee7ba9734d20de29";
const CO2_EMISSION_FACTOR = 0.0005; // Metric tons CO2 per kWh
const POWER_USAGE_PER_VCPU = 0.65; // kWh per vCPU per hour

async function fetchDataAndStore() {
  try {
    const now = new Date();
    const past = new Date(now.getTime() - 3600 * 1000); // 1 hour back

    // Fetch CPU, Memory, Network IO, Storage IO, and Cost
    const [cpuData, memoryData, networkData, storageData, costData, ec2Data] =
      await Promise.all([
        cloudwatch.send(
          new GetMetricStatisticsCommand({
            MetricName: "CPUUtilization",
            Namespace: "AWS/EC2",
            Period: 300,
            Statistics: ["Average"],
            StartTime: past,
            EndTime: now,
            Dimensions: [{ Name: "InstanceId", Value: instanceId }],
          })
        ),

        cloudwatch.send(
          new GetMetricStatisticsCommand({
            MetricName: "MemoryUtilization",
            Namespace: "System/Linux",
            Period: 300,
            Statistics: ["Average"],
            StartTime: past,
            EndTime: now,
            Dimensions: [{ Name: "InstanceId", Value: instanceId }],
          })
        ),

        cloudwatch.send(
          new GetMetricStatisticsCommand({
            MetricName: "NetworkIn",
            Namespace: "AWS/EC2",
            Period: 300,
            Statistics: ["Sum"],
            StartTime: past,
            EndTime: now,
            Dimensions: [{ Name: "InstanceId", Value: instanceId }],
          })
        ),

        cloudwatch.send(
          new GetMetricStatisticsCommand({
            MetricName: "DiskWriteOps",
            Namespace: "AWS/EC2",
            Period: 300,
            Statistics: ["Sum"],
            StartTime: past,
            EndTime: now,
            Dimensions: [{ Name: "InstanceId", Value: instanceId }],
          })
        ),

        costexplorer.send(
          new GetCostAndUsageCommand({
            TimePeriod: { Start: "2025-02-15", End: "2025-02-16" },
            Granularity: "DAILY",
            Metrics: ["UsageQuantity"],
            Filter: {
              Dimensions: {
                Key: "SERVICE",
                Values: ["Amazon Elastic Compute Cloud - Compute"],
              },
            },
          })
        ),

        ec2.send(
          new DescribeInstancesCommand({
            InstanceIds: [instanceId],
          })
        ),
      ]);

    // Get latest data points
    const latestCPU = cpuData.Datapoints.length
      ? cpuData.Datapoints.sort(
          (a, b) => new Date(b.Timestamp) - new Date(a.Timestamp)
        )[0].Average
      : 0;

    const latestMemory = memoryData.Datapoints.length
      ? memoryData.Datapoints.sort(
          (a, b) => new Date(b.Timestamp) - new Date(a.Timestamp)
        )[0].Average
      : null;

    const latestNetworkIO = networkData.Datapoints.length
      ? networkData.Datapoints.sort(
          (a, b) => new Date(b.Timestamp) - new Date(a.Timestamp)
        )[0].Sum /
        1024 /
        1024
      : null; // Convert from bytes to MB

    const latestStorageIO = storageData.Datapoints.length
      ? storageData.Datapoints.sort(
          (a, b) => new Date(b.Timestamp) - new Date(a.Timestamp)
        )[0].Sum
      : null;

    const costAmount = costData.ResultsByTime.length
      ? parseFloat(
          costData.ResultsByTime[0]?.Total?.UsageQuantity?.Amount || "0"
        )
      : 0;

    // Extract instance details
    const instanceDetails = ec2Data.Reservations?.[0]?.Instances?.[0] || {};
    const instanceType = instanceDetails.InstanceType || "unknown";
    const vCPUs = instanceDetails.CpuOptions
      ? instanceDetails.CpuOptions.CoreCount * 2
      : 2; // Default to 2 if unknown

    // Calculate power consumption and carbon emissions
    const powerConsumption = vCPUs * POWER_USAGE_PER_VCPU; // kWh
    const carbonFootprint = powerConsumption * CO2_EMISSION_FACTOR; // Metric tons CO2

    // Determine Instance State (Idle, Transaction, Weekend)
    const isWeekend = now.getDay() === 0 || now.getDay() === 6; // Sunday = 0, Saturday = 6
    let instanceState = "transaction"; // Default state

    if (isWeekend) {
      instanceState = "weekend";
    } else if (latestCPU < 5) {
      instanceState = "idle";
    }

    // Save to MongoDB
    const newMetric = new InstanceMetric({
      instanceId,
      instanceType,
      vCPUs,
      cpuUtilization: latestCPU,
      memoryUtilization: latestMemory,
      networkIO: latestNetworkIO,
      storageIO: latestStorageIO,
      costUsage: costAmount,
      powerConsumption,
      carbonEmission: carbonFootprint,
      instanceState, // Store instance state
    });

    await newMetric.save();
    // console.log("Saved data:", newMetric);
  } catch (error) {
    console.error("Error storing data:", error.message);
  }
}

async function sample() {
  try {
    const instanceId = "i-0ee7ba9734d20de29";
    const instanceType = "t2.medium";
    const vCPUs = 2;

    // Generate random test data
    const latestCPU = (Math.random() * 100).toFixed(2); // Random CPU %
    const latestMemory = (Math.random() * 100).toFixed(2); // Random Memory %
    const latestNetworkIO = (Math.random() * 1000).toFixed(2); // Random MB
    const latestStorageIO = (Math.random() * 500).toFixed(2); // Random IO ops
    const costAmount = (Math.random() * 5).toFixed(2); // Random cost

    // Dynamic Power Consumption based on CPU load
    const basePowerUsage = vCPUs * 0.65; // Base power usage (kWh)
    const efficiencyFactor = 0.8 + Math.random() * 0.4; // Random factor (0.8 - 1.2)
    const powerConsumption = (
      basePowerUsage *
      (latestCPU / 100) *
      efficiencyFactor
    ).toFixed(4); // Adjusted based on CPU

    // Dynamic Carbon Emission based on power usage and a random energy mix
    const CO2_EMISSION_FACTOR = 0.0004 + Math.random() * 0.0002; // Dynamic factor (0.0004 - 0.0006 metric tons CO2 per kWh)
    const carbonFootprint = (powerConsumption * CO2_EMISSION_FACTOR).toFixed(6); // More realistic dynamic value

    // Assign random instance state
    const states = ["idle", "transaction", "weekend"];
    const instanceState = states[Math.floor(Math.random() * states.length)];

    // Create new metric object with fake data
    const newMetric = new InstanceMetric({
      instanceId,
      instanceType,
      vCPUs,
      cpuUtilization: latestCPU,
      memoryUtilization: latestMemory,
      networkIO: latestNetworkIO,
      storageIO: latestStorageIO,
      costUsage: costAmount,
      powerConsumption,
      carbonEmission: carbonFootprint,
      instanceState, // Store instance state
    });

    await newMetric.save();
    // console.log("Saved random test data:", newMetric);
  } catch (error) {
    console.error("Error storing test data:", error.message);
  }
}

// Fetch data every 10 seconds
setInterval(sample, 10000);
// setInterval(sample, 1800000);
// setInterval(fetchDataAndStore, 10000);

app.get("/metrics", async (req, res) => {
  try {
    const latestMetrics = await InstanceMetric.find()
      .sort({ timestamp: -1 })
      .limit(20);
    res.json(latestMetrics);
  } catch (error) {
    console.error("Error fetching metrics:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/metrics/historical", async (req, res) => {
  try {
    // Extract query parameters for filtering and manipulation
    const { startDate, endDate, instanceState, sortBy, groupBy, aggregate } =
      req.query;

    // Build the base query
    let query = {};

    // Filter by date range if provided
    if (startDate && endDate) {
      query.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // Filter by instance state if provided
    if (instanceState) {
      query.instanceState = instanceState;
    }

    // Fetch all data matching the query
    let data = await InstanceMetric.find(query);

    // Sort data if sortBy parameter is provided
    if (sortBy) {
      const sortOrder = sortBy.startsWith("-") ? -1 : 1;
      const sortField = sortOrder === -1 ? sortBy.slice(1) : sortBy;
      data.sort((a, b) =>
        a[sortField] > b[sortField] ? sortOrder : -sortOrder
      );
    }

    // Group data if groupBy parameter is provided
    if (groupBy) {
      const groupedData = data.reduce((acc, entry) => {
        const key = entry[groupBy];
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(entry);
        return acc;
      }, {});

      // Aggregate data if aggregate parameter is provided
      if (aggregate) {
        for (const key in groupedData) {
          groupedData[key] = groupedData[key].reduce(
            (acc, entry) => {
              if (aggregate === "sum") {
                acc.carbonEmission += entry.carbonEmission;
                acc.cpuUtilization += entry.cpuUtilization;
                acc.memoryUtilization += entry.memoryUtilization;
              } else if (aggregate === "average") {
                acc.carbonEmission += entry.carbonEmission;
                acc.cpuUtilization += entry.cpuUtilization;
                acc.memoryUtilization += entry.memoryUtilization;
                acc.count = (acc.count || 0) + 1;
              }
              return acc;
            },
            { carbonEmission: 0, cpuUtilization: 0, memoryUtilization: 0 }
          );

          if (aggregate === "average") {
            groupedData[key].carbonEmission /= groupedData[key].count;
            groupedData[key].cpuUtilization /= groupedData[key].count;
            groupedData[key].memoryUtilization /= groupedData[key].count;
            delete groupedData[key].count;
          }
        }
      }

      data = groupedData;
    }

    // Send the manipulated data as response
    res.json(data);
  } catch (error) {
    console.error("Error fetching historical metrics:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  fetchDataAndStore();
});
