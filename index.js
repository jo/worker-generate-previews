// Worker Generate Thumbnails
var request = require("request");

var WorkerGenerateThumbnails = require("./lib/WorkerGenerateThumbnails.js");

var config = {
  server: process.env.HOODIE_SERVER || "http://127.0.0.1:5984"
};

var workers = [];
request({
  uri: config.server + "/_all_dbs"
}, function(error, response, body) {
  if(error !== null) {
    console.warn("init error, _all_dbs: " + error);
  }

  var dbs = JSON.parse(body);
  dbs.forEach(function(db) {
    var worker = new WorkerGenerateThumbnails(config, db);
    workers.push(worker);
  });
});
