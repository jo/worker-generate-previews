// Worker Attachments
var request = require("request");

var WorkerAttachments = require("worker-attachments/lib/WorkerAttachments");

// example mimimal worker that checks every jpg or png image
var processor = (function() {
  var formats = ['jpg', 'png'];

  return {
    check: function(doc, name) {
      return formats.indexOf(name.toLowerCase().replace(/^.*\.([^\.]+)$/, '$1')) > -1;
    },
    process: function(doc, name, next) {
      this._log(doc, 'found image: ' + name);
      // do stuff...
      next();
    }
  };
})();
var config = {
  server: process.env.HOODIE_SERVER || "http://127.0.0.1:5984",
  name: 'generate-stills',
  config_id: 'worker-config/generate-stills',
  processor: processor,
  defaults: {
    folder: 'stills',
    size: '200x300'
  }
};

var workers = [];
request(config.server + "/_all_dbs", function(error, response, body) {
  if(error !== null) {
    console.warn("init error, _all_dbs: " + error);
    return;
  }

  var dbs = JSON.parse(body);
  // listen on each db.
  // Note that you have to restart the worker
  // in order to listen to newly created databases.
  dbs.forEach(function(db) {
    var worker = new WorkerAttachments(config, db);
    workers.push(worker);
  });
});
