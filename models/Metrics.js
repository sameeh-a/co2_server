const mongoose = require("mongoose");

const InstanceMetricSchema = new mongoose.Schema({
  instanceId: { type: String, required: true },
  instanceType: { type: String }, // e.g., "t3.medium"
  vCPUs: { type: Number, default: 2 }, // Default to 2 if unknown
  cpuUtilization: { type: Number, required: true },
  memoryUtilization: { type: Number },
  networkIO: { type: Number }, // Network traffic (MB)
  storageIO: { type: Number }, // Disk read/write (MB)
  costUsage: { type: Number, default: 0 },
  powerConsumption: { type: Number }, // kWh, calculated from vCPUs
  carbonEmission: { type: Number, required: true }, // CO2 emissions (metric tons)
  instanceState: { type: String, enum: ["idle", "transaction", "weekend"], default: "idle" }, // State classification
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model("InstanceMetric", InstanceMetricSchema);
