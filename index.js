// Worker Generate Previews

var request = require("request");
var WorkerAttachments = require("worker-attachments/lib/WorkerAttachments");

var processor = (function() {
  var formats = ['pdf'],
      path = require('path'),
      fs = require('fs'),
      util = require('util'),
      spawn = require('child_process').spawn;

  function process(doc, name, url, version, options, cb) {
    var tempdir = '/tmp',
        // note that util.format does not support something like %3d
        previewname = tempdir + '/' + name.replace(/\..*$/, '') + '-%d.jpg',
        args = ['-', '-scale', options.size, previewname],
        convert = spawn('convert', args);

    convert.on('exit', (function(code) {
      var i = 0,
          filename;

      if (code !== 0) {
        return cb(code);
      }

      while (path.existsSync(util.format(previewname, i))) {
        filename = util.format(previewname, i);

        doc._attachments[version + '/' + path.basename(filename)] = {
          content_type: 'image/jpeg',
          data: fs.readFileSync(filename).toString('base64')
        };
        fs.unlinkSync(filename);
        i++;
      }

      cb(code);
    }).bind(this));

    // request image and send it to imagemagick
    request(url).pipe(convert.stdin);
  }

  return {
    check: function(doc, name) {
      return formats.indexOf(name.toLowerCase().replace(/^.*\.([^\.]+)$/, '$1')) > -1;
    },
    process: function(doc, name, next) {
      var cnt = 0;
      for (version in this.config.versions) cnt++;

      for (version in this.config.versions) {
        this._log(doc, 'render ' + version + '/' + name);
        process(doc, name, this._urlFor(doc, name), version, this.config.versions[version], (function(code) {
          if (code !== 0) {
            console.warn("error in `convert`")
            this._log(doc, 'error ' + version + '/' + name);
          } else {
            this._log(doc, 'done ' + version + '/' + name);
          }
          cnt--;
          if (cnt === 0) next(null);
        }).bind(this));
      }
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
    versions: {
      previews: {
        size: '1024x800'
      }
    }
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
