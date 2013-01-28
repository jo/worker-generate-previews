// Worker Generate Thumbnails

var request = require("request");
var _ = require("underscore");
var path = require('path');
var fs = require('fs');
var util = require('util');
var spawn = require('child_process').spawn;
var Worker = require("couchdb-worker").attachments;

function generateStills(doc, name, version, options, done) {
  var attachments = doc._attachments || {},
      url = this.server
        + '/' + encodeURIComponent(this.db)
        + '/' + encodeURIComponent(doc._id)
        + '/' + encodeURIComponent(name),
      basename = name.replace(/\..*$/, ''),
      prefix = '/tmp/' + encodeURIComponent(doc._id) + '-' + version  + '-' + basename.replace('/', '-') + '-',
      suffix = '.jpg',
      args = ['-', '-scale', options.size, '-colorspace', 'sRGB', prefix + '%04d' + suffix],
      convert = spawn('convert', args);

  convert.stderr.pipe(process.stderr);

  convert.on('exit', (function(code) {
    var i = 0,  // convert starts with 0
        attachments = {},
        filename;

    if (code !== 0) {
      return done(code);
    }

    while (path.existsSync(prefix + String('0000' + i).slice(-4) + suffix)) {
      filename = prefix + String('0000' + i).slice(-4) + suffix;

      attachments[version + '/' + basename + String('0000' + i).slice(-4) + suffix] = {
        content_type: 'image/jpeg',
        data: fs.readFileSync(filename).toString('base64')
      };
      fs.unlinkSync(filename);
      i++;
    }

    done(code, attachments);
  }).bind(this));

  // request image and send it to imagemagick
  request(url).pipe(convert.stdin);
}

var formats = ['pdf'];
var config = {
  name: 'generate-previews',
  server: process.env.COUCH_SERVER || "http://127.0.0.1:5984",
  defaults: {
    versions: {
      previews: {
        size: '1024x800'
      }
    }
  },
  processor: {
    check: function(doc, name) {
      var folder = name.split('/', 1)[0];

      // ignore own folders by version name
      return  !_.any(_.keys(this.config.versions), function(version) { return version === folder; })
        // only process formats we know
        && formats.indexOf(name.toLowerCase().replace(/^.*\.([^\.]+)$/, '$1')) > -1;
    },
    process: function(doc, name, done) {
      var cnt = _.size(this.config.versions);

      _.each(this.config.versions, function(config, version) {
        var attachments = doc._attachments || {};

        this._log('render ' + doc._id + '/' + version + '/' + name);

        generateStills.call(this, doc, name, version, config, function(code, attachment) {
          if (code !== 0) {
            console.warn("error in `convert`")
            this._log('error ' + doc._id + '/' + version + '/' + name);
          } else {
            _.extend(attachments, attachment);
            this._log('done ' + doc._id + '/' + version + '/' + name);
          }
          cnt--;
          if (cnt === 0) done(null, { _attachments: attachments });
        }.bind(this));
      }, this);
    }
  }
};

if (process.env.COUCH_DB) {
  new Worker(config, process.env.COUCH_DB);
} else {
  console.error('I need the environment variable COUCH_DB');
}
