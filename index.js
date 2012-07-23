var WorkerGenerateThumbnails = require("./lib/WorkerGenerateThumbnails.js");

var config = {
  server: process.env.HOODIE_SERVER || "http://127.0.0.1:5984",
  database: process.env.HOODIE_DATABASE
};
var worker = new WorkerGenerateThumbnails(config);
