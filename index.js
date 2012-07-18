var WorkerNew = require("./lib/WorkerNew.js");

var config = {
    server: process.env.HOODIE_SERVER || "http://127.0.0.1:5984"
};
var worker = new WorkerNew(config);
