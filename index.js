;(function(Backbone, _, io) {
'use strict';

/**
 * Expose `Porchetta`.
 */

window.Porchetta = Porchetta;

/**
 * Connect to porchetta server by `url`
 * and join selected `room`.
 *
 * Example:
 *
 *   new Porchetta(http://localhost:4000, app.company.id, { 'force new connection': true });
 *
 * @param {String} url
 * @param {String} room
 * @param {Object} options - socket.io-client options
 */

function Porchetta(url, room, options) {
  this.socket  = io.connect(url, options);
  this.active  = false;
  this.objects = {};
  this.subscribe('sync', this.onsync);

  // emit viewers
  this.subscribe('viewers', function(viewers) {
    this.active = viewers.length > 1;
    this.trigger('viewers', viewers);
  });

  // join room
  this.subscribe('connect', function() {
    this.socket.emit('room', room);
    this.trigger('connect');
  });
}

// Add event-emitter options
_.extend(Porchetta.prototype, Backbone.Events);

/**
 * Observe `collection` changes.
 *
 * Example:
 *
 *   porchetta
 *     .addCollection(app.vendors);
 *     .addCollection(app.accounts);
 *
 * @param {Backbone.Collection} collection
 * @param {String} name
 */

Porchetta.prototype.addCollection = function(collection, name) {
  if (!name || this.objects[name])
    throw new TypeError('Collection has to have unique name or already added');

  this.objects[name] = collection;
  collection.on('add', this.handleEvent('add', name), this);
  collection.on('change', this.handleEvent('change', name), this);
  collection.on('remove', this.handleEvent('remove', name), this);

  return this;
};

/**
 * Observe `model` changes.
 * Logic is similar to `addCollection` method.
 *
 * @param {Backbone.Model} model
 * @param {String} name
 */

Porchetta.prototype.addModel = function(model, name) {
  if (!name || this.objects[name])
    throw new TypeError('Model has to have unique name or already added');

  this.objects[name] = model;
  model.on('change', this.handleEvent('change', name), this);

  return this;
};

/**
 * Handles `sync` event to update collection based on received data.
 */

Porchetta.prototype.onsync = function(data) {
  var collection = this.objects[data.name];
  var model = _.isFunction(collection.isNew) ? collection : null;

  switch (data.event) {
    case 'add':
      collection.add(data.json, { socketId: data.socketId });
      break;

    case 'change':
      if (!model) model = collection.get(data.json.id);
      if (model) model.set(data.json, { socketId: data.socketId });
      break;

    case 'remove':
      model = collection.get(data.json.id);
      if (model) collection.remove(model, { socketId: data.socketId });
      break;
  }

  this.trigger(data.name + ':' + data.event, data.json);
};

/**
 * Helper, that emits sync event on every collection change.
 * Helps to manage `add`, `change`, and `remove` events.
 */

Porchetta.prototype.handleEvent = function(event, name) {
  return function(model, collection, options) {
    if (!this.active) return; // return if only one viewer
    if (!options) options = collection; // for change event
    if (options && options.socketId) return; // prevent updates after sync

    this.socket.emit('sync', {
      name: name,
      event: event,
      socketId: this.socket.socket.sessionid,
      json: model.toJSON()
    });
  };
};

/**
 * Subscribe on socket.io events and bind callback to current instance.
 */

Porchetta.prototype.subscribe = function(event, cb) {
  this.socket.on(event, _.bind(cb, this));
};

}).call(this, Backbone, _, io);
