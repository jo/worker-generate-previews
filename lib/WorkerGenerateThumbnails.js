var CouchDBChanges = require("CouchDBChanges");
var request = require("request");
var spawn = require('child_process').spawn;
var _ = require("underscore");

module.exports = WorkerGenerateThumbnails;

function WorkerGenerateThumbnails(options, db) {
  this.options = options;
  this.db = db;

  this.name = 'generate-thumbnails';
  this.configDocId = "worker-config/" + this.name;
  this.defaults = {
    size: '120x90'
  };

  var follow_options = {
    url: this.options.server
  };

  var changes_options = {
    include_docs: true
  };

  console.log('WorkerGenerateThumbnails running at ' + this.options.server + '/' + this.db);

  var changes = new CouchDBChanges(this.options.server);

  changes.follow(this.db, this._change_cb.bind(this), follow_options, changes_options);
}

WorkerGenerateThumbnails.prototype._change_cb = function(error, change) {
  if (error !== null) {
    console.warn("error in WorkerGenerateThumbnails")
    console.warn(error)
    return;
  }

  if (change.doc && change.doc._id === this.configDocId) {
    this._setConfig(change.doc);
  } else if (this.config) {
    this._generateThumbnails(change.doc);
  }
}

// update worker config from doc
WorkerGenerateThumbnails.prototype._setConfig = function(doc) {
  if (doc._deleted) {
    // delete
    this._log(doc, 'delete config');
    delete this.config;
  } else {
    // update
    this._log(doc, this.config ? 'update config' : 'create config');

    // apply default worke config
    this.config = _.extend({}, this.defaults, this.config);
  }
}

// get worker status
WorkerGenerateThumbnails.prototype._getStatus = function(doc) {
  return doc.worker_status &&
    doc.worker_status[this.name];
};
  
// set worker status
WorkerGenerateThumbnails.prototype._setStatus = function(doc, stat) {
  doc.worker_status || (doc.worker_status = {});

  doc.worker_status[this.name] = {
    status: stat,
    revpos: parseInt(doc._rev)
  };
};
  
// return true if the doc needs to be processed
WorkerGenerateThumbnails.prototype._checkStatus = function(stat, doc, attachment) {
  return !stat ||                    // no status doc
    (
     stat.status === 'completed' &&  // attachment has changed
     attachment.revpos > stat.revpos // after completed processing
    );
};

// return true if filetype supported by imagemagick
WorkerGenerateThumbnails.prototype._checkFiletype = function(name) {
  return _.indexOf(this.options.formats, name.replace(/^.*\.([^\.]+)$/, '$1')) > -1;
};

// select attachments for prozessing
WorkerGenerateThumbnails.prototype._selectAttachments = function(doc) {
  var stat = this._getStatus(doc);

  return _.compact(_.map(doc._attachments, function(attachment, name) {
    if (
        this._checkStatus(stat, doc, attachment) &&    // attachment needs processing
        !name.match(/^thumbnails\//) &&                // ignore thumbnails
        this._checkFiletype(name)                      // select only images imagemagick can understand
      ) return name;

    return null;
  }, this));
};

// return url for an attachment
WorkerGenerateThumbnails.prototype._urlFor = function(doc, attachment) {
  return this.options.server +
    '/' + encodeURIComponent(this.db) +
    '/' + encodeURIComponent(doc._id) +
    (attachment ? '/' + encodeURIComponent(attachment) : '');
};

// log a message
WorkerGenerateThumbnails.prototype._log = function(doc, msg) {
  if (!msg) {
    msg = doc;
  }
  console.log('[%s] %s: %s',this.db, doc._id || '', msg);
};

// process one attachment
WorkerGenerateThumbnails.prototype._generateThumbnail = function(doc, name, cb) {
  var args = ['-', '-thumbnail', this.config.size, '-'];
  var convert = spawn('convert', args);

  this._log(doc, 'convert ' + name);

  // print errors
  convert.stderr.pipe(process.stderr);

  convert.stdout.on('data', _.bind(function(data) {
    doc._attachments['thumbnails/' + name] = {
      content_type: 'image/jpeg',
      data: data.toString('base64')
    };
    cb();
  }, this));

  convert.on('exit', _.bind(function(code) {
    if (code !== 0) {
      console.warn("error in WorkerGenerateThumbnails")
      console.warn(error)
      this._log(doc, 'error ' + name);
      return;
    }

    this._log(doc, 'done ' + name);
  }, this));

  // request image and send it to imagemagick
  request(this._urlFor(doc, name)).pipe(convert.stdin);
};

// save doc
// TODO: retry
WorkerGenerateThumbnails.prototype._saveDoc = function(doc, cb) {
  request({
    url: this._urlFor(doc),
    method: 'PUT',
    body: doc,
    json: true
  }, cb);
};

// convert image
WorkerGenerateThumbnails.prototype._generateThumbnails = function(doc) {
  var attachments = this._selectAttachments(doc);

  if (!attachments.length) return;

  // grap document
  this._setStatus(doc, 'triggered');
  this._saveDoc(doc, _.bind(function(err, resp, data) {
    var cnt = attachments.length;

    // update rev, got it.
    doc._rev = data.rev;
    this._log(doc, 'triggered');

    var cb = _.bind(function() {
      cnt--;

      // TODO: check for errors

      if (cnt === 0) {
        this._setStatus(doc, 'completed');
        this._saveDoc(doc, _.bind(function() {
          this._log(doc, 'completed');
        }, this));
      }
    }, this);

    // start processing each image in paralel
    _.each(attachments, function(name) {
      this._generateThumbnail(doc, name, cb);
    }, this);
  }, this));
};

