const logger = new (require('../logger'))('STATE_EVENT_TREE_MANAGER');
const CommonUtil = require('../common/common-util');
const { isValidStateLabel } = require('../db/state-util');
const EVENT_NODE_LABEL = '.event';
const WILDCARD_LABEL = '*';
const HandlerError = require('./event-handler-error');
const { EventHandlerErrorCode } = require('../common/result-code');

class StateEventTreeManager {
  constructor() {
    this.stateEventTree = {}; // TODO(cshcomcom): Use Map.
    this.filterIdToParsedPath = {};
  }

  static isValidPathForStateEventTree(parsedPath) {
    for (const label of parsedPath) {
      if (isValidStateLabel(label) === false) {
        return false;
      }
    }
    return true;
  }

  registerEventFilterId(valuePath, filterId) {
    const parsedValuePath = CommonUtil.parsePath(valuePath);
    let currNode = this.stateEventTree;
    for (let [idx, label] of parsedValuePath.entries()) {
      if (CommonUtil.isVariableLabel(label)) {
        label = WILDCARD_LABEL;
      }
      if (!currNode[label]) {
        currNode[label] = {};
      }
      if (idx === parsedValuePath.length - 1) { // Last node case
        if (!currNode[label][EVENT_NODE_LABEL]) {
          currNode[label][EVENT_NODE_LABEL] = {
            filterIdSet: new Set(),
          };
        }
        currNode[label][EVENT_NODE_LABEL].filterIdSet.add(filterId);
      } else {
        currNode = currNode[label];
      }
    }
    this.filterIdToParsedPath[filterId] = parsedValuePath;
  }

  visitNodes(labels) {
    const visitNodeList = [];
    let currNode = this.stateEventTree;
    for (let label of labels) {
      if (CommonUtil.isVariableLabel(label)) {
        label = WILDCARD_LABEL;
      }
      if (!currNode[label]) { // Already deleted case.
        return visitNodeList;
      }
      currNode = currNode[label];
      visitNodeList.push(currNode);
    }
    return visitNodeList;
  }

  deleteEmptyNodes(labelList, nodeList) {
    // Since it is a tree structure, it proceeds in the opposite direction.
    for (let i = nodeList.length - 1; i >= 0; i--) {
      const currNode = nodeList[i];
      const eventNode = currNode[EVENT_NODE_LABEL];

      // Delete event node with no filter Ids.
      if (eventNode) {
        const filterIdSet = eventNode.filterIdSet;
        if (filterIdSet.values().length > 0) { // Non-empty
          break;
        }
        delete eventNode.filterIdSet;
        delete currNode[EVENT_NODE_LABEL];
      }

      // Delete a node with no sub nodes.
      if (Object.keys(currNode).length === 0) {
        const prevNode = i > 0 ? nodeList[i - 1] : this.stateEventTree;
        const label = CommonUtil.isVariableLabel(labelList[i]) ? WILDCARD_LABEL : labelList[i];
        delete prevNode[label];
      }
    }
  }

  deleteFilterIdFromEventNode(eventNode, filterId) {
    if (!eventNode || !eventNode.filterIdSet) {
      throw new HandlerError(EventHandlerErrorCode.MISSING_FILTER_ID_SET,
          `Can't find filterIdSet (eventNode: ${JSON.stringify(eventNode)})`, filterId);
    }
    if (!eventNode.filterIdSet.delete(filterId)) {
      throw new HandlerError(EventHandlerErrorCode.MISSING_FILTER_ID_IN_FILTER_ID_SET,
          `Can't delete filter id from filterIdSet ` +
          `(${JSON.stringify(eventNode.filterIdSet.values())})`, filterId);
    }
  }

  deregisterEventFilterId(filterId) {
    const parsedPath = this.filterIdToParsedPath[filterId];
    if (!parsedPath) {
      throw new HandlerError(EventHandlerErrorCode.MISSING_FILTER_ID_IN_FILTER_ID_TO_PARSED_PATH,
          `Can't find parsedPath from filterIdToParsedPath (${filterId})`, filterId);
    }
    delete this.filterIdToParsedPath[filterId];

    const visitNodeList = this.visitNodes(parsedPath);
    if (visitNodeList.length === 0) {
      return;
    }

    // Delete filterId from filterIdSet.
    const lastNode = visitNodeList[visitNodeList.length - 1];
    const eventNode = lastNode[EVENT_NODE_LABEL];
    this.deleteFilterIdFromEventNode(eventNode, filterId);

    // Delete empty nodes.
    this.deleteEmptyNodes(parsedPath, visitNodeList);
  }

  matchEventFilterPathRecursive(currNode, depth, parsedValuePath) {
    const matchedEventFilterIds = [];
    if (depth === parsedValuePath.length) { // Last node case
      const eventNode = currNode[EVENT_NODE_LABEL];
      if (eventNode) {
        const filterIdSet = eventNode.filterIdSet;
        matchedEventFilterIds.push(...filterIdSet);
      }
      return matchedEventFilterIds;
    }

    const nextNode = currNode[parsedValuePath[depth]];
    if (nextNode) {
      matchedEventFilterIds.push(
          ...this.matchEventFilterPathRecursive(nextNode, depth + 1, parsedValuePath));
    }

    const wildcardNode = currNode[WILDCARD_LABEL];
    if (wildcardNode) {
      matchedEventFilterIds.push(
          ...this.matchEventFilterPathRecursive(wildcardNode, depth + 1, parsedValuePath));
    }

    return matchedEventFilterIds;
  }

  matchEventFilterPath(parsedValuePath) {
    return this.matchEventFilterPathRecursive(this.stateEventTree, 0, parsedValuePath)
  }
}

module.exports = StateEventTreeManager;
