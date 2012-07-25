// Worker Attachments
var request = require("request");

var WorkerAttachments = require("worker-attachments/lib/WorkerAttachments");

// example mimimal worker that checks every jpg or png image
var processor = (function() {
  var formats = ['mp4'],
      ffmpeg = require("fluent-ffmpeg"),
      _ = require("underscore");

  return {
    check: function(doc, name) {
      return formats.indexOf(name.toLowerCase().replace(/^.*\.([^\.]+)$/, '$1')) > -1;
    },
    process: function(doc, name, next) {
      var tempdir = '/tmp';
      var options = {
        count: 9,
        filename: doc._id + '-screenshot-%i',
        timemarks: [ '10%', '20%', '30%', '40%', '50%', '60%', '70%', '80%', '90%' ]
      };

      // FIXME
      // guess I need a prox stream to pipe the response to

      // request image and send it to ffmpeg
      request(this._urlFor(doc, name), _.bind(function(error, response, data) {
        new ffmpeg({ source: data })
          .withSize(this.config.size)
          .takeScreenshots(options, tempdir, function(error, thumbnames) {
            if (error) {
              console.warn('Error creating video thumbnail:');
              console.warn(error);
              return next(error);
            }

            thumbnames.forEach(function(thumbname, i) {
              var filename = tempdir + '/' + thumbname;

              try {
                doc._attachments['thumbs/' + i + '.jpg'] = {
                  content_type: 'image/jpeg',
                  data: fs.readFileSync(filename).toString('base64')
                };
                fs.unlinkSync(filename);
              } catch(error) {
                console.warn('Error creating video thumbnail:');
                console.warn(error);
                delete doc._attachments['thumbs/' + i + '.jpg'];
              }
            });

            next();
          });
      }, this));
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
