var CouchDBChanges = require("CouchDBChanges");

var imagemagick = require('imagemagick');

module.exports = WorkerGenerateThumbnails;

function WorkerGenerateThumbnails(config) {
  this.config = config;

  // image resize options
  this.options = {
    width: 130,
    height: 130
  };

  if (!this.config.database) throw('WorkerGenerateThumbnails needs a database name. Please set the HOODIE_DATABASE environment variable.');

  var follow_options = {
    url: this.config.server
  };

  var changes_options = {
    include_docs: true
  };

  console.log('WorkerGenerateThumbnails running at ' + config.server + '/' + this.config.database);

  var changes = new CouchDBChanges(config.server);

  // TODO:
  //   1. fetch options doc
  //   2. listen for options changes

  changes.follow(this.config.database, this._change_cb.bind(this), follow_options, changes_options);
}

WorkerGenerateThumbnails.prototype._change_cb = function(error, change) {
  if (error !== null) {
    console.warn("error in WorkerGenerateThumbnails")
    console.warn(error)
    return;
  }
};
