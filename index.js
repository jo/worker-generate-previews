// Worker Attachments
var request = require("request");

var WorkerAttachments = require("worker-attachments/lib/WorkerAttachments");

// example mimimal worker that checks every jpg or png image
var processor = (function() {
  var formats = ['jpg', 'png'],
      spawn = require('child_process').spawn,
      _ = require("underscore");

  return {
    check: function(doc, name) {
      return formats.indexOf(name.toLowerCase().replace(/^.*\.([^\.]+)$/, '$1')) > -1;
    },
    process: function(doc, name, next) {
      var args = ['-', '-thumbnail', this.config.size, '-'],
          convert = spawn('convert', args);

      this._log(doc, 'convert ' + name);

      // print errors
      convert.stderr.pipe(process.stderr);

      convert.stdout.on('data', _.bind(function(data) {
        doc._attachments[this.config.folder + '/' + name] = {
          content_type: 'image/jpeg',
          data: data.toString('base64')
        };
        next();
      }, this));

      convert.on('exit', _.bind(function(code) {
        if (code !== 0) {
          console.warn("error in `convert`")
          this._log(doc, 'error ' + name);
          return;
        }

        this._log(doc, 'done ' + name);
      }, this));

      // request image and send it to imagemagick
      request(this._urlFor(doc, name)).pipe(convert.stdin);
    }
  };
})();
  
var config = {
  server: process.env.HOODIE_SERVER || "http://127.0.0.1:5984",
  name: 'generate-thumbnails',
  config_id: 'worker-config/generate-thumbnails',
  processor: processor,
  defaults: {
    folder: 'thumbnails',
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
