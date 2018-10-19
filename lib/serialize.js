'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var debug = require('debug')('json-immutable');
var immutable = require('immutable');

// var JSONStreamStringify = require('json-stream-stringify');

var nativeTypeHelpers = require('./helpers/native-type-helpers');

function serialize(data) {
  var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

  if (immutable.Iterable.isIterable(data) || data instanceof immutable.Record || nativeTypeHelpers.isSupportedNativeType(data)) {
    var patchedData = Object.create(data);

    if (nativeTypeHelpers.isSupportedNativeType(data)) {
      // NOTE: When native type (such as Date or RegExp) methods are called
      //   on an `Object.create()`'d objects, invalid usage errors are thrown
      //   in many cases. We need to patch the used methods to work
      //   on originals.
      nativeTypeHelpers.patchNativeTypeMethods(patchedData, data);
    }

    // NOTE: JSON.stringify() calls the #toJSON() method of the root object.
    //   Immutable.JS provides its own #toJSON() implementation which does not
    //   preserve map key types.
    patchedData.toJSON = function () {
      debug('#toJSON()', this);
      return this;
    };

    data = patchedData;
  }

  var indentation = options.pretty ? 2 : 0;

  return JSON.stringify(data, replace, indentation);
}

// function createSerializationStream(data) {
//   var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
//
//   var indentation = options.pretty ? 2 : 0;
//   var replacer = options.bigChunks ? replace : replaceAsync;
//
//   var stream = JSONStreamStringify(data, replacer, indentation);
//   return stream;
// }

function replace(key, value) {
  debug('key:', key);
  debug('value:', value);

  var result = value;

  if (value instanceof immutable.Record) {
    result = replaceRecord(value, replace);
  } else if (immutable.Iterable.isIterable(value)) {
    result = replaceIterable(value, replace);
  } else if (Array.isArray(value)) {
    result = replaceArray(value, replace);
  } else if (nativeTypeHelpers.isDate(value)) {
    result = { '__date': value.toISOString() };
  } else if (nativeTypeHelpers.isRegExp(value)) {
    result = { '__regexp': value.toString() };
  } else if ((typeof value === 'undefined' ? 'undefined' : _typeof(value)) === 'object' && value !== null) {
    result = replacePlainObject(value, replace);
  }

  debug('result:', result, '\n---');
  return result;
}

function replaceAsync(key, value) {
  debug('key:', key);
  debug('value:', value);

  var result = value;

  if (!(value instanceof Promise)) {
    if (value instanceof immutable.Record) {
      result = new Promise(function (resolve) {
        setImmediate(function () {
          resolve(replaceRecord(value, replaceAsync));
        });
      });
    } else if (immutable.Iterable.isIterable(value)) {
      result = new Promise(function (resolve) {
        setImmediate(function () {
          resolve(replaceIterable(value, replaceAsync));
        });
      });
    } else if (Array.isArray(value)) {
      result = new Promise(function (resolve) {
        setImmediate(function () {
          resolve(replaceArray(value, replaceAsync));
        });
      });
    } else if ((typeof value === 'undefined' ? 'undefined' : _typeof(value)) === 'object' && value !== null) {
      result = new Promise(function (resolve) {
        setImmediate(function () {
          resolve(replacePlainObject(value, replaceAsync));
        });
      });
    }
  }

  debug('result:', result, '\n---');
  return result;
}

function replaceRecord(rec, replaceChild) {
  debug('replaceRecord()', rec);
  var recordDataMap = rec.toMap();
  var recordData = {};

  recordDataMap.forEach(function (value, key) {
    recordData[key] = replaceChild(key, value);
  });

  if (!rec._name) {
    return recordData;
  }
  return { "__record": rec._name, "data": recordData };
}

function getIterableType(iterable) {
  if (immutable.List.isList(iterable)) {
    return 'List';
  }

  if (immutable.Stack.isStack(iterable)) {
    return 'Stack';
  }

  if (immutable.Set.isSet(iterable)) {
    if (immutable.OrderedSet.isOrderedSet(iterable)) {
      return 'OrderedSet';
    }

    return 'Set';
  }

  if (immutable.Map.isMap(iterable)) {
    if (immutable.OrderedMap.isOrderedMap(iterable)) {
      return 'OrderedMap';
    }

    return 'Map';
  }

  return undefined;
}

function replaceIterable(iter, replaceChild) {
  debug('replaceIterable()', iter);

  var iterableType = getIterableType(iter);
  if (!iterableType) {
    throw new Error('Cannot find type of iterable: ' + iter);
  }

  switch (iterableType) {
    case 'List':
    case 'Set':
    case 'OrderedSet':
    case 'Stack':
      var listData = [];
      iter.forEach(function (value, key) {
        listData.push(replaceChild(key, value));
      });
      return { "__iterable": iterableType, "data": listData };

    case 'Map':
    case 'OrderedMap':
      var mapData = [];
      iter.forEach(function (value, key) {
        mapData.push([key, replaceChild(key, value)]);
      });
      return { "__iterable": iterableType, "data": mapData };
  }
}

function replaceArray(arr, replaceChild) {
  debug('replaceArray()', arr);

  return arr.map(function (value, index) {
    return replaceChild(index, value);
  });
}

function replacePlainObject(obj, replaceChild) {
  debug('replacePlainObject()', obj);

  var objData = {};
  Object.keys(obj).forEach(function (key) {
    objData[key] = replaceChild(key, obj[key]);
  });

  return objData;
}

module.exports = {
  // createSerializationStream: createSerializationStream,
  serialize: serialize
};
