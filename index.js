// Worker Generate Previews

var request = require("request");
var WorkerAttachments = require("worker-attachments/lib/WorkerAttachments");

var processor = (function() {
  var formats = ['pdf'],
      path = require('path'),
      fs = require('fs'),
      util = require('util'),
      spawn = require('child_process').spawn;

  return {
    check: function(doc, name) {
      return formats.indexOf(name.toLowerCase().replace(/^.*\.([^\.]+)$/, '$1')) > -1;
    },
    process: function(doc, name, next) {
      var tempdir = '/tmp',
          // note that util.format does not support something like %3d
          previewname = tempdir + '/' + name.replace(/\..*$/, '') + '-%d.jpg',
          args = [this._urlFor(doc, name), '-scale', this.config.size, previewname],
          convert = spawn('convert', args);


      this._log(doc, 'convert ' + name);

      convert.on('exit', (function(code) {
        var i = 0,
            filename;

        if (code !== 0) {
          console.warn("error in `convert`")
          this._log(doc, 'error ' + name);
        } else {
          while (path.existsSync(util.format(previewname, i))) {
            filename = util.format(previewname, i);

            doc._attachments[this.config.folder + '/' + path.basename(filename)] = {
              content_type: 'image/jpeg',
              data: fs.readFileSync(filename).toString('base64')
            };
            fs.unlinkSync(filename);
            i++;
          }

          this._log(doc, 'done ' + name);
        }
        
        next(code);
      }).bind(this));
    }
  };
})();
var config = {
  server: process.env.HOODIE_SERVER || "http://127.0.0.1:5984",
  name: 'generate-previews',
  config_id: 'worker-config/generate-previews',
  processor: processor,
  defaults: {
    folder: 'previews',
    size: '1024x800'
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
