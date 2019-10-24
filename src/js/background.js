const SIDEBARS = {};
const TREE = {};

const ID_TO_PID = {};
const PID_TO_ID = {};

const MOVE_CACHE = {};
const RESTORE_CACHE = {};

const CI_CACHE = {};

let DEBUG_MODE;
let STARTING = true;

let CACHE;
let QUEUE;
let CONFIG;

let LAST_CLOSED_INFO = null;
let NEXT_PERSISTENT_ID;
let SELECTION_SOURCE_WINDOW;

let START_TIME;

const DescendantOpenPosition = {
	default: 0
	, first: 1
	, last: 2
};

function toPid(id) {
	return ID_TO_PID[id];
}

function toId(pid) {
	return PID_TO_ID[pid];
}

function wait(dur) {
	return new Promise(function (res) {
		setTimeout(res, dur);
	});
}

function assignParent(tab) {
	if (tab.pinned) return -1;

	let parentId = toId(CACHE.getValue(tab.id, 'parentPid'));
	let tree = TREE[tab.windowId];

	if (parentId == null) {
		parentId = tab.openerTabId || -1;
	}

	if (tree.get(parentId) == null) {
		parentId = -1;
	}

	if (parentId != -1 && CACHE.get(parentId).pinned) {
		return -1;
	}

	return parentId;
}

function assignPid(id) {
	let pid = toPid(id);
	// avoid reassigning pid for existing tabs e.g. when a new
	// window is created by detaching a tab from another window
	if (pid != null) return pid;

	pid = CACHE.getValue(id, 'pid');

	// This comparison is for detecting duplicated tabs: duplication
	// appears to copy sessionstore items for the given tab, so after
	// duplication there are two tabs with the same pid, however the id
	// is still unique (within session).
	if (pid != null && toId(pid) != null) pid = null;

	if (pid == null) {
		pid = NEXT_PERSISTENT_ID;
		NEXT_PERSISTENT_ID++;

		browser.storage.local.set({
			next_persistent_id: NEXT_PERSISTENT_ID
		});
	}

	PID_TO_ID[pid] = id;
	ID_TO_PID[id] = pid;
	CACHE.setValue(id, 'pid', pid);

	return pid;
}

function getParentOptions(windowId, index) {
	if (index == 0) return [-1];

	let tree = TREE[windowId];
	let previous = tree.getIndexed(index - 1);

	let ancestors = tree.ancestorIds(previous.id);
	ancestors.unshift(previous.id);

	let lastDescendantId = tree.findLastDescendant(tree.getIndexed(index).id);
	let next = tree.getIndexed(tree.get(lastDescendantId).index + 1);

	if (next != null) {
		let nextAncestors = tree.ancestorIds(next.id);
		let n = nextAncestors.length - 1;
		ancestors = ancestors.splice(0, ancestors.length - n);
	}

	return ancestors;
}

function storeArrayRelationData(windowId, array) {
	let tree = TREE[windowId];
	array.forEach(id => {
		let node = tree.get(id);
		let data = {
			parentPid: toPid(node.parentId),
			ancestors: tree.ancestorIds(node.id).map(id => toPid(id)),
			childPids: node.childNodes.map(child => toPid(child.id))
		}

		MOVE_CACHE[id] = data;
	});
}

function restoreAncestor(windowId, id, ancestorPids) {
	let tree = TREE[windowId];
	let node = tree.get(id);
	let ancestorId;
	let parentOptions = getParentOptions(windowId, node.index);

	for (let i = 0; i < ancestorPids.length; i++) {
		let candidateId = toId(ancestorPids[i]);
		if (parentOptions.includes(candidateId)) {
			ancestorId = candidateId;
			break;
		}
	}

	if (ancestorId != null) tree.changeParent(id, ancestorId);
	CACHE.setValue(id, 'parentPid', toPid(node.parentId));
}

function restoreDescendants(windowId, parentId, childPids) {
	if (childPids.length == 0) return;
	let tree = TREE[windowId];
	let pid = toPid(parentId);

	childPids = childPids.map(pid => tree.get(toId(pid)))
		.filter(node => node != null)
		.sort((a, b) => a.index - b.index);

	let change;
	do {
		change = false;
		// todo: use filter and check for length change of the array
		childPids.forEach(child => {
			if (child.parentId != parentId
				&& getParentOptions(windowId, child.index).includes(parentId)) {
				tree.changeParent(child.id, parentId);
				CACHE.setValue(child.id, `parentPid`, pid);
				change = true;
			}
		});
	} while(change);
}

async function newWindow(windowId) {
	let tree = new TreeStructure();
	tree.windowId = windowId;
	TREE[windowId] = tree;

	function possibleAncestors(index) {
		if (index == 0) return [-1];
		let previous = tree.getIndexed(index - 1);
		let ancestors = tree.ancestorIds(previous.id);
		ancestors.unshift(previous.id);
		return ancestors;
	}

	let first = CACHE.getIndexed(windowId, 0);
	CACHE.setValue(first.id, 'parentPid', -1);

	await CACHE.forEach(tab => assignPid(tab.id), windowId);

	let count = 0;

	await CACHE.forEach(function (tab) {
		let id = tab.id;
		let parentId = tab.pinned ? -1 : toId(CACHE.getValue(id, 'parentPid'));
		if (parentId == null && tab.openerTabId != null) {
			parentId = tab.openerTabId;
		}

		try {
			if (parentId == null) {
				console.log(`Found tab ${tab.id} (${tab.url}) with no parentId`);
				return;
			}

			let ancestors = possibleAncestors(count);
			if (!ancestors.includes(parentId)) {
				console.log(`Tab ${tab.id} (${tab.url}) had parentId ${parentId}, but it wasn't included in ancestors list`);
				let ancestorIds = ancestors.map(toId);
				console.log(`Ancestors: ${ancestorIds}`);
				let parentTab = CACHE.get(parentId);
				if (parentTab == null) {
					console.log(`Parent with pid ${[parentId]} doesn't exist`);
				} else {
					console.log(parentTab);
				}
				return;
			}
		} catch(e) {
			console.log(e);
			return;
		}

		let node = tree.new(id);
		tree.changeParent(id, parentId);
		CACHE.setValue(id, 'parentPid', toPid(node.parentId));
		count++;
	}, windowId);

	await CACHE.forEach(function (tab) {
		let id = tab.id;
		if (tree.get(id) != null) return;

		let node = tree.new(id);
		tree.move(id, tab.index);

		let parentId = toId(CACHE.getValue(tab.id, 'parentPid'));
		let parentOptions = getParentOptions(windowId, tab.index);

		if (parentOptions.includes(parentId))  {
			tree.changeParent(id, parentId);
		} else if (parentOptions.includes(tab.openerTabId)) {
			tree.changeParent(id, tab.openerTabId);
		}

		CACHE.setValue(tab.id, 'parentPid', toPid(node.parentId));
	}, windowId);

	if (DEBUG_MODE) {
		tree_debug_mixin(tree);
		tree.validate();
	}

	return tree;
}

async function onUpdated(tab, info) {
	if (info.pinned === true) {
		let tree = TREE[tab.windowId];
		let node = tree.get(tab.id);
		let children = node.childNodes.slice(0);
		tree.promoteFirstChild(tab.id);
		children.forEach(child => CACHE.setValue(child.id, 'parentPid', toPid(child.parentId)));
		tree.changeParent(tab.id, -1);
		CACHE.setValue(tab.id, 'parentPid', -1);
	}

	sidebar(tab.windowId, 'onUpdated', tab, info);
}

async function onMoved(tab, info) {
	let windowId = info.windowId;
	let id = tab.id;
	let tree = TREE[tab.windowId];
	let cachedData = MOVE_CACHE[id];
	let node = tree.get(id);

	record(windowId);

	if (node.childNodes.length > 0) {
		let children = node.childNodes.slice(0);
		if (cachedData == null) storeArrayRelationData(windowId, tree.subtreeArray(id));
		tree.promoteFirstChild(id);
		children.forEach(child => CACHE.setValue(child.id, 'parentPid', toPid(child.parentId)));
	}

	tree.move(id, tab.index);

	if (cachedData == null) {
		let parentOptions = getParentOptions(tab.windowId, tab.index);
		let parentId = parentOptions[parentOptions.length -1];
		tree.changeParent(id, parentId);
		CACHE.setValue(id, 'parentPid', toPid(parentId));
	} else  {
		restoreAncestor(windowId, id, cachedData.ancestors);
		restoreDescendants(windowId, id, cachedData.childPids);
		delete MOVE_CACHE[id];
	}

	if (DEBUG_MODE) tree.validate();
	sidebar(windowId, 'onMoved', id, info);
}

async function onActivated(tab, info) {
	let windowId = tab.windowId;

	if (CONFIG.stayInTreeOnTabClose && LAST_CLOSED_INFO != null
		&& windowId == LAST_CLOSED_INFO.windowId && tab.index >= LAST_CLOSED_INFO.index) {

		let tree = TREE[windowId];
		if (tree.get(tab.id).parentId != LAST_CLOSED_INFO.parentId) {
			let lin = tree.debug().array;
			let i = LAST_CLOSED_INFO.index - 1;
			let node;

			while (i > -1) {
				node = lin[i--];
				if (node != null && CACHE.get(node.id).hidden == false) {
					try {
						await browser.tabs.update(node.id, {
							active: true
						});
						break;
					}
					catch (e) {}
				}

				if (node.parentId == -1) break;
			}
		}

	}

	LAST_CLOSED_INFO = null;

	sidebar(windowId, 'onActivated', tab.id);
}

async function onRemoved(tab, info, values) {
	let id = tab.id
	let pid = toPid(id);
	let windowId = tab.windowId;
	let tree = TREE[windowId];
	let node = tree.get(id);

	if (node == null) return;

	record(windowId);

	let children = node.childNodes.slice(0);

	let index = node.index;
	tree.remove(id);

	children.forEach(child => CACHE.setValue(child.id, 'parentPid', toPid(child.parentId)));

	RESTORE_CACHE[pid] = children.map(child => toPid(child.id));

	// If the tab is childless and it's the last child of it's parent,
	// the active tab after closing will be in a different tree. If this
	// happens, we'll hijack the onActivated event and switch to a tab in
	// the previous tree.
	if (tab.active) {
		LAST_CLOSED_INFO = {
			index: tab.index
			, windowId: tab.windowId
			, parentId: node.parentId
		};
	}

	delete ID_TO_PID[id];
	delete PID_TO_ID[pid];

	if (DEBUG_MODE) tree.validate();
	sidebar(windowId, 'onRemoved', tab, info, values);
}

async function onAttached(tab, info) {
	onDetached(tab, info);

	let id = tab.id;
	let windowId = info.newWindowId;
	let tree = TREE[windowId];
	let node;

	record(windowId);

	if (tree == null) {
		tree = await newWindow(windowId);
		node = tree.get(id);
	} else {
		node = tree.new(id);
		tree.move(id, info.newPosition);

		let cachedData = MOVE_CACHE[id];
		restoreAncestor(windowId, id, cachedData.ancestors);
		restoreDescendants(windowId, id, cachedData.childPids);
	}

	delete MOVE_CACHE[id];
	CACHE.setValue(id, 'parentPid', toPid(node.parentId));

	if (DEBUG_MODE) tree.validate();
	sidebar(windowId, 'onCreated', tab);
}

function onDetached(tab, info) {
	let windowId = info.oldWindowId;
	let tree = TREE[windowId];
	let id = tab.id;
	let node = tree.get(id);

	record(windowId);

	let children = node.childNodes.slice(0);

	if (MOVE_CACHE[id] == null) storeArrayRelationData(windowId, tree.subtreeArray(id));

	tree.remove(id);

	children.forEach(child => CACHE.setValue(child.id, 'parentPid', toPid(child.parentId)));

	let values = {
		fold: CACHE.getValue(tab.id, 'fold')
	}

	sidebar(windowId, 'onRemoved', tab, info, values);
}

async function onCreated(tab) {
	let windowId = tab.windowId;
	let id = tab.id;
	let tree = TREE[windowId];
	let node;
	let pid;

	if (tree == null) {
		tree = await newWindow(windowId);
		node = tree.get(id);
		pid = toPid(id);
	}
	else {
		record(windowId);
		pid = assignPid(tab.id);
		let parentId = assignParent(tab);

		node = tree.new(id);
		tree.move(id, tab.index);

		let parentOptions = getParentOptions(tab.windowId, tab.index);

		if (!parentOptions.includes(parentId)) {
			let i = parentOptions.length == 1 ? 0 : 1;
			parentId = parentOptions[i];
		}

		tree.changeParent(id, parentId);
	}

	CACHE.setValue(tab.id, 'parentPid', toPid(node.parentId));

	let childPids = RESTORE_CACHE[pid];
	delete RESTORE_CACHE[pid];

	if (childPids == null) {
		let parent = CACHE.get(node.parentId);
		if (parent != null && !parent.pinned) {
			switch(CONFIG.descendantOpenPosition) {
				case DescendantOpenPosition.first:
					if (node.index != parent.index + 1) {
						storeArrayRelationData(windowId, [id]);

						browser.tabs.move(id, {
							index: parent.index + 1,
							windowId
						});
					}
					break;
				case DescendantOpenPosition.last:
					let lastChildId = tree.findLastDescendant(node.parentId);
					if (node.id != lastChildId) {
						storeArrayRelationData(windowId, [id]);

						browser.tabs.move(id, {
							index: tree.get(lastChildId).index,
							windowId
						});
					}
					break;
				default:
					break;
			}
		}
	} else {
		restoreDescendants(windowId, id, childPids);
	}

	if (DEBUG_MODE) tree.validate();
	sidebar(windowId, 'onCreated', tab);
}

function composeSidebarUpdateMessage(windowId, fn, param) {
	let msg = { recipient: Number(windowId) };
	switch(fn) {
		case 'onActivated':
			msg.type = MSG_TYPE.OnActivated;
			msg.tabId = param[0];
			break;

		case 'onCreated':
			msg.type = MSG_TYPE.OnCreated;
			msg.tab = param[0];
			msg.deltas = TREE[windowId].endRecord();
			break;

		case 'onMoved':
			msg.type = MSG_TYPE.OnMoved;
			msg.tabId = param[0];
			msg.info = param[1];
			msg.deltas = TREE[windowId].endRecord();
			break;

		case 'onRemoved':
			msg.type = MSG_TYPE.OnRemoved;
			msg.tab = param[0];
			msg.info = param[1];
			msg.values = param[2];
			msg.deltas = TREE[windowId].endRecord();
			break;

		case 'onUpdated':
			msg.type = MSG_TYPE.OnUpdated;
			msg.tab = param[0];
			msg.info = param[1];
			break;

		case 'signal':
			msg.type = MSG_TYPE.Signal;
			msg.signal = param[0];
			break;
	}

	return msg;
}

function sidebar(windowId, fn, ...param) {
	let sb = SIDEBARS[windowId];
	if (sb == null) return;

	try {
		if (sb.useApi) {
			let msg = composeSidebarUpdateMessage(windowId, fn, param);
			browser.runtime.sendMessage(msg);
		} else {
			sb.sidebar[fn](...param);
		}
	} catch(e) {
		delete SIDEBARS[windowId];
		if (DEBUG_MODE) console.log(e);
	}
}

function record(windowId) {
	let sb = SIDEBARS[windowId];
	if (sb != null && sb.useApi) TREE[windowId].beginRecord();
}

async function registerSidebar(sidebar, windowId) {
	while (STARTING) {
		await wait(50);
	}

	QUEUE.do(async () => {
		SIDEBARS[windowId] = { sidebar, useApi: false };

		await sidebar.createTree({
			cache: CACHE,
			tree: TREE[windowId],
			startTime: START_TIME
		});
	});
}

function enqueueTask(task, ...param) {
	return QUEUE.do(task, ...param);
}

async function broadcast(param) {
	for (let k in SIDEBARS) {
		sidebar(k, 'signal', param);
	}
}

function setSelectionSourceWindow(windowId) {
	SELECTION_SOURCE_WINDOW = windowId;
}

function getSelectionSourceWindow() {
	return SELECTION_SOURCE_WINDOW;
}

async function getSelectionFromSourceWindow(src = SELECTION_SOURCE_WINDOW) {
	let sb = SIDEBARS[src];
	if (sb != null) {
		try {
			if (sb.useApi)
				return await browser.runtime.sendMessage({
					recipient: src,
					type: MSG_TYPE.GetSelection
				});

			return sb.sidebar.getSelection();
		} catch(e) {
			if (DEBUG_MODE) console.log(e);
		}
	}

	return [];
}

function sortFilterSidebarSelection(ids) {
	return ids.filter(id => !CACHE.get(id).hidden)
	.sort((idA, idB) => CACHE.get(idA).index - CACHE.get(idB).index);
}

async function sidebarDropMoving(ids, tarId, before, windowId) {
	if (ids.length == 0) return;
	let tree = TREE[windowId];
	let index;

	if (tarId == -1) {
		index = -1;
	} else {
		let tarTab = CACHE.get(tarId);
		if (tarTab == null) {
			return;
		} else {
			index = tarTab.index;
		}
	}

	if (!before) {
		if (CACHE.getValue(tarId, 'fold') == true) {
			index = tree.get(tree.findLastDescendant(tarId)).index;
		}

		index++;
	}

	if (ids.length > 1) {
		ids = sortFilterSidebarSelection(ids);
	} else {
		ids = TREE[SELECTION_SOURCE_WINDOW].subtreeArray(ids[0])
			.filter(id => !CACHE.get(id).hidden);
	}

	if (ids.length == 0) return;

	storeArrayRelationData(SELECTION_SOURCE_WINDOW, ids);

	if (SELECTION_SOURCE_WINDOW == windowId) {
		if (CACHE.get(ids[0]).index < index) index -= 1;

		browser.tabs.move(ids, {
			index,
			windowId
		});
	} else {
		bug1394477Workaround(ids, windowId, index);
	}
}

async function sidebarDropParenting(ids, parentId, windowId) {
	if (ids.length == 0) return;
	let tree = TREE[windowId];
	if (tree.get(parentId) == null) return;
	if (CACHE.get(parentId).pinned) return;

	let sameWindow = SELECTION_SOURCE_WINDOW == windowId;

	let index = -1;
	let tarNode = tree.getIndexed(tree.get(tree.findLastDescendant(parentId)).index + 1);
	if (tarNode != null) {
		index = tarNode.index;
	}

	if (ids.length > 1) {
		ids = sortFilterSidebarSelection(ids);

		if (sameWindow) {
			let cmpIndex = index;
			let i = 0;
			while (i < ids.length && CACHE.get(ids[i]).index == index) {
				index++;
				i++;
			}

			ids.splice(0, i).forEach(id => {
				if (getParentOptions(windowId, cmpIndex++).includes(parentId)) {
					tree.changeParent(id, parentId);
					CACHE.setValue(id, 'parentPid', toPid(parentId));
					sidebar(windowId, 'updateChildPositions', parentId);
				}
			});

			if (ids.length == 0) return;

			storeArrayRelationData(SELECTION_SOURCE_WINDOW, ids);
			ids.forEach(id => MOVE_CACHE[id].ancestors.unshift(toPid(parentId)));
			if (CACHE.get(ids[0]).index < index) index -= 1;

			browser.tabs.move(ids, {
				index,
				windowId
			});
		} else {
			storeArrayRelationData(SELECTION_SOURCE_WINDOW, ids);
			ids.forEach(id => MOVE_CACHE[id].ancestors.unshift(toPid(parentId)));
			bug1394477Workaround(ids, windowId, index);
		}
	}
	else {
		let tabId = ids[0];
		let tab = CACHE.get(tabId);
		if (tab == null) return;

		if (tarNode != null) {
			if (sameWindow && tab.index < index) index--;
		}

		if (sameWindow && tab.index == index) {
			if (getParentOptions(windowId, index).includes(parentId)) {
				tree.changeParent(tabId, parentId);
				CACHE.setValue(tabId, 'parentPid', toPid(parentId));

				if (DEBUG_MODE) tree.validate();
				sidebar(windowId, 'updateChildPositions', parentId);
			}
		} else {
			let ids = TREE[tab.windowId].subtreeArray(tabId);
			ids = ids.filter(id => !CACHE.get(id).hidden);
			storeArrayRelationData(tab.windowId, ids);
			MOVE_CACHE[tabId].ancestors.unshift(toPid(parentId));

			if (sameWindow) {
				browser.tabs.move(ids, {
					index,
					windowId
				});
			} else {
				bug1394477Workaround(ids, windowId, index);
			}
		}
	}
}

// https://bugzilla.mozilla.org/show_bug.cgi?id=1394477
function bug1394477Workaround(ids, windowId, index) {
	if (index == -1) {
		browser.tabs.move(ids, {
			index,
			windowId
		});

		return;
	}

	ids.forEach(id => {
		browser.tabs.move(id, {
			index,
			windowId
		});

		index++;
	});
}

async function init() {
	let config = await browser.storage.local.get();
	NEXT_PERSISTENT_ID = config.next_persistent_id || 0;

	DEBUG_MODE = config.debug_mode || false;
	if (DEBUG_MODE) console.log(`Using ftt with debug mode enabled.`);

	PID_TO_ID[-1] = -1;
	ID_TO_PID[-1] = -1;

	await CACHE.forEachWindow(newWindow);

	START_TIME = Date.now();
	STARTING = false;
}

async function bgInternalMessageHandler(msg, sender, resolve, reject) {
	if (msg.recipient !== undefined && msg.recipient != -1) return;

	switch(msg.type) {
		case MSG_TYPE.Register:
			let windowId = Number(msg.windowId);
			SIDEBARS[windowId] = {
				useApi: true,
				sidebar: sender
			};

			let deltas = TREE[windowId].asDeltas();
			let tabs = [];
			let values = {};

			await CACHE.forEach(tab => {
				tabs.push(tab);
				values[tab.id] = { fold: CACHE.getValue(tab.id, 'fold') || false };
			}, windowId);

			resolve({
				tabs,
				deltas,
				values,
				startTime: START_TIME
			});

			break;

		case MSG_TYPE.SetSelectionSource:
			SELECTION_SOURCE_WINDOW = Number(msg.windowId)
			break;

		case MSG_TYPE.GetSelection:
			let selection = await getSelectionFromSourceWindow();
			resolve(selection);
			break;

		case MSG_TYPE.DropMoving:
			await sidebarDropMoving(msg.selection, msg.tabId, msg.before, msg.windowId);
			break;

		case MSG_TYPE.DropParenting:
			await sidebarDropParenting(msg.selection, msg.tabId, msg.windowId);
			break;

		case MSG_TYPE.UpdateSidebarContextMenu:
			await menuUpdate(msg.tabId, msg.plural);
			resolve();
			break;

		case MSG_TYPE.GetSelectionSource:
			resolve(SELECTION_SOURCE_WINDOW);
			break;

		case MSG_TYPE.SessionsValueUpdated:
			CACHE.setValue(msg.tabId, msg.key, msg.value);
			browser.runtime.sendMessage({
				type: MSG_TYPE.SessionsValueUpdated,
				tabId: msg.tabId,
				key: msg.key,
				value: msg.value
			});
			break;
	}
}

async function initConfig() {
	const defaults = {
		descendantOpenPosition: DescendantOpenPosition.last
		, stayInTreeOnTabClose: true
	};

	CONFIG = await browser.storage.local.get();
	if (CONFIG == null) CONFIG = {};

	let manifest = await browser.runtime.getManifest();
	if (CONFIG.firstInstallVersion == null) {
		CONFIG.firstInstallVersion = manifest.version;
	};

	for (let k in defaults) CONFIG[k] === undefined ? defaults[k] : CONFIG[k];

	CONFIG.version = manifest.version;
	await browser.storage.local.set(CONFIG);
	let cis = await browser.contextualIdentities.query({});
	cis.forEach( ci => CI_CACHE[ci.cookieStoreId] = ci );
}

async function start() {
	CACHE = newCache({
		listeners: {
			onActivated,
			onAttached,
			onCreated,
			onMoved,
			onRemoved,
			onUpdated
		},
		tabValueKeys: ['pid', 'parentPid', 'fold'],
		auto: true
	});

	QUEUE = CACHE.debug().queue;

	browser.contextualIdentities.onCreated.addListener(info => QUEUE.do(async () => {
		CI_CACHE[info.contextualIdentity.cookieStoreId] = info.contextualIdentity;
	}));

	browser.contextualIdentities.onRemoved.addListener(info => QUEUE.do(async () => {
		delete CI_CACHE[info.contextualIdentity.cookieStoreId];
	}));

	browser.contextualIdentities.onUpdated.addListener(info => QUEUE.do(async () => {
		CI_CACHE[info.contextualIdentity.cookieStoreId] = info.contextualIdentity;
	}));

	await initConfig();

	browser.runtime.onMessageExternal.addListener(function (msg, sender, sendResponse) {
		return new Promise(function (res, rej) {
			QUEUE.do(async function () {
				let tab = CACHE.get(msg.tab);
				if (tab == null) {
					rej();
					return;
				}
				let tree = TREE[tab.windowId];
				let ret = tree.ancestorIds(tab.id);
				ret.pop();

				res({
					parents: ret
				});
			});
		});
	});

	browser.runtime.onMessage.addListener((msg, sender, sendResponse) =>
		new Promise((res, rej) => QUEUE.do(bgInternalMessageHandler, msg, sender, res, rej)));

	await getLocalizedStrings();
	await createSidebarContext();
	await CACHE.init(init);
}

start();
