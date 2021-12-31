const _ = require('lodash');
const stringify = require('fast-json-stable-stringify');
const sizeof = require('object-sizeof');
const CommonUtil = require('./common-util');

class ObjectUtil {
  static toChunksRecursive(obj, chunkSize, path) {
    const chunkList = [];
    if (!CommonUtil.isDict(obj)) {
      let currentSize = sizeof(obj);
      const originalSize = currentSize;
      let isEmpty = false;
      if (currentSize >= chunkSize) {
        chunkList.push({
          path: JSON.parse(JSON.stringify(path)),
          size: currentSize,
          data: JSON.parse(JSON.stringify(obj)),
        });
        currentSize = 0;
        isEmpty = true;
      }
      return {
        originalSize,
        currentSize,
        isEmpty,
        chunks: chunkList,
      }
    }
    // Phase I: Get the currentSize.
    let currentSize = 0;
    let isEmpty = false;
    const keyList = Object.keys(obj).sort((a, b) => a.localeCompare(b));
    for (const key of keyList) {
      const subObj = obj[key];
      path.push(key);
      const subRes = ObjectUtil.toChunksRecursive(subObj, chunkSize, path);
      chunkList.push(...subRes.chunks);
      if (subRes.isEmpty) {
        obj[key] = null;
      }
      currentSize += sizeof(key) + subRes.currentSize;
      path.pop();
    }
    // Phase II: Make chunks.
    const originalSize = currentSize;
    if (currentSize >= chunkSize) {
      chunkList.push({
        path: JSON.parse(JSON.stringify(path)),
        size: currentSize,
        data: JSON.parse(JSON.stringify(obj)),
      });
      currentSize = 0;
      isEmpty = true;
    }
    return {
      originalSize,
      currentSize,
      isEmpty,
      chunks: chunkList,
    }
  }

  /**
   * Split the given object to chunks with the given chunk size.
   * 
   * @param {Object} obj object to split
   * @param {Number} chunkSize chunk size
   * @returns an array of the chunks
   */
  // NOTE(platfowner): This function modifies the input object!!
  static toChunks(obj, chunkSize) {
    const path = [];
    const res = ObjectUtil.toChunksRecursive(obj, chunkSize, path)
    const chunkList = res.chunks;
    if (!res.isEmpty) {
      let currentSize = sizeof(obj);
      chunkList.push({
        path: JSON.parse(JSON.stringify(path)),
        size: currentSize,
        data: JSON.parse(JSON.stringify(obj)),
      });
    }
    return chunkList.reverse();
  }

  static mergeDataToObject(path, data, obj) {
    if (!CommonUtil.isArray(path)) {
      return null;
    }
    if (path.length === 0) {
      return data;
    }

    const root = CommonUtil.isDict(obj) ? obj : {};
    let curObj = root;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (curObj[key] === undefined) {
        curObj[key] = {};
      }
      curObj = curObj[key];
    }
    const key = path[path.length - 1];
    curObj[key] = data;

    return root;
  }

  /**
   * Constructs an object from the given chunks.
   * 
   * @param {Array} chunkList chunk list
   * @returns the constructed object
   */
  static fromChunks(chunkList) {
    let obj = null;
    for (const chunk of chunkList) {
      obj = ObjectUtil.mergeDataToObject(chunk.path, chunk.data, obj);
    }

    return obj;
  }
}

module.exports = ObjectUtil;
