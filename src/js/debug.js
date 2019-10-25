let CONT = false;

function assert(condition, error) {
	if (!condition) {
		CONT = false;
		printAllTrees();
		throw new Error(error);
	}
}

function tree_debug_mixin(tree) {
	let debugData = tree.debug();
	let index = debugData.map;
	let linear = debugData.array;

	function countOccurrences(tarId, source) {
		let sum = 0;

		if (source.id == tarId) {
			sum += 1;
		}

		for (let i in source.childNodes) {
			sum += countOccurrences(tarId, source.childNodes[i]);
		}
		return sum;
	}

	function parentCheck(node) {
		if (node.id == -1)
			return;

		assert(node.parentId != null && node.parent != null, `Node was missing parentId ${node.parentId} or parent ${node.parent}`);
		assert(node.parent.id == node.parentId, `Node ${node.id} had parentId of ${node.parentId}, but parent had id ${node.parent.id}`);
		assert(node.parentId != node.id, `Node ${node.id} is parented to itself`);
	}

	function parentChildCheck(origin) {
		for (let i in origin.childNodes) {
			let node = origin.childNodes[i];

			assert(node.parentId == origin.id, `Parent with ID ${origin.id} is not set as the parent of ${node.id} (parent marked as ${node.parentId} instead).`);
			parentChildCheck(node);
		}
	}

	function childParentcheck(node) {
		if (node.id == -1) {
			return;
		}
		let parentNode = tree.get(node.parentId);
		assert(parentNode != null, `Node ${node.id} has parent ${node.parentId}, but couldn't find this parent node.`);
		assert(parentNode.childNodes.includes(node), `Node ${node.id} has parent ${node.parentId}, but ${node.id} wasn't listed as one of the children.`)
	}

	function validateInternalLinearity() {
		let n = linear.length;
		for (let i = 0; i < n; i++) {
			let cur = tree.getIndexed(i);
			assert(cur != null, `Gap in linear index at ${i}`);
			assert(i == cur.index, `Node ${cur.id} at linear index ${i} points to linear index ${cur.index}`);
		}
	}

	tree.linearIndex = function (id) {
		let indexFound = false;
		let counter = -1;

		function findLinearIndex(node) {
			if (node.id == id) {
				indexFound = true;
				return;
			}

			if (indexFound) return;
			counter++;
			node.childNodes.forEach(findLinearIndex);
		}

		findLinearIndex(tree.get(-1), id);

		return indexFound ? counter : -1;
	}

	tree.nodeAtLinIn = function (tar) {
		let counter = -1;
		let nodeFound = null;

		function nodeAtLinIn(node, tar) {
			if (counter == tar) {
				nodeFound = node;
				return;
			}

			counter++;

			for (let i in node.childNodes) {
				nodeAtLinIn(node.childNodes[i], tar);
				if (nodeFound) return;
			}
		}

		nodeAtLinIn(tree.get(-1), tar);
		return nodeFound;
	}

	tree.treeSize = function (source) {
		let sum = 1;

		for (let i in source.childNodes) {
			sum += tree.treeSize(source.childNodes[i]);
		}

		return sum;
	}

	tree.size = function () {
		return tree.treeSize(tree.get(-1));
	}

	tree.length = function () {
		return Object.keys(index).length;
	}

	tree.validateLinearity = function() {
		if (tree.getIndexed(0) == null && CACHE.debug().windows[tree.windowId] == null) return;
		let tabs = CACHE.debug().windows[tree.windowId];
		let n = tabs.length;

		for (let i = 0; i < n; i++) {
			let tab = tabs[i];
			let id = tab.id;
			let index = tree.linearIndex(id);
			let node = tree.nodeAtLinIn(index);
			assert(i == node.index, `Node of tab ${tab.id} ${tab.url} was at index ${node.index} compared to tab index ${tab.index}`);
			assert(tree.getIndexed(i).id == id, `Expected node ${id} at index ${i}, got ${tree.getIndexed(i).id} instead.`);
			assert(id == node.id, `Index: ${index}. Found node ${node.id}with actual linear index ${tree.linearIndex(node.id)}`);
			assert(index == tab.index, `Tab ${id} ${tab.url} position ${tab.index} doesn't match linear pos ${index} in tree`);
		}
	}

	tree.validate = function () {
		for (let k in index) {
			let occ = countOccurrences(k, tree.get(-1));
			childParentcheck(tree.get(k));
			parentCheck(tree.get(k));

			assert(occ == 1, `Found ${occ} occurrences of node with pid ${k}`);
			assert(k == tree.get(k).id, `Incorrect node ${tree.get(k).id} was mapped to key ${k}`);
		}

		for (let i = 0; i < linear.length; i++) {
			let a = linear[i];
			assert(i == a.index, `Node ${a.id} index ${a.index} didn't match index in linear array ${i}`);
			let idx = tree.linearIndex(a.id);
			assert(i == idx, `Node ${a.id} was at index ${i}, but was at ${idx} when traversing tree`);
		}

		for (let i = 0; i < linear.length; i++) {
			let node = linear[i];
			let id = linear[i].id;
			let parentId = toId(CACHE.getValue(id, 'parentPid'));
			assert(parentId === node.parentId, `Node ${node.id} had parent ${node.parentId}, but cache had parent ${parentId}`);
		}

		validateInternalLinearity();
		tree.validateLinearity();
		parentChildCheck(tree.get(-1));
		assert(tree.length() == tree.size(), `Nodes length ${tree.length()} doesn't match the size ${tree.size()}`);
	}
}

function printAllTrees() {
	for (let k in TREE) {
		console.log(`Tree: ${k}`);
		printTree(TREE[k]);
	}
}

function printTree(src) {
	function format(num) {
		if (num < 10)
			return `00${num}`
		if (num < 100)
			return `0${num}`
		return num
	}

	let str = "tree: \n";

	let c = 0;
	function recurse(parent, depth) {
		for (let i in parent.childNodes) {
			str += `[${format(c++)}] `;
			let child = parent.childNodes[i];
			for (let k = 0; k < depth; k++) {
				str += '    ';
			}
			let tab = CACHE.get(child.id);

			str += `pid: ${child.id}, id: ${tab.id} ${tab.title} (${tab.url})\n`;

			recurse(child, depth + 1);
		}
	}

	recurse(src.get(-1), 0);

	str += "\n\n\n\nlinear: \n";

	let lin = src.debug().array;

	for (let i = 0; i < lin.length; i++) {
		let tab = CACHE.get(lin[i].id);
		str += `[${i}] pid: ${lin[i].id}, id: ${tab.id} ${tab.title} (${tab.url})\n`;
	}

	console.log(str);
}

async function RESET_TAB_DATA() {
	await CACHE.forEach((tab) => {
		CACHE.removeValue(tab.id, 'parentPid');
		CACHE.removeValue(tab.id, 'pid');
	});
}

async function VALIDATE_ALL() {
	for (let k in TREE) {
		let tree = TREE[k];
		if (!DEBUG_MODE && tree.validate == null) tree_debug_mixin(tree);
		tree.validate();
	}

	console.log(`Done.`);
}

async function VALIDATE_STORED_DATA() {
	await CACHE.forEach(async tab => {
		let sessionpid = await browser.sessions.getTabValue(tab.id, 'pid');
		let cachepid = CACHE.getValue(tab.id, 'pid');
		assert(sessionpid == cachepid,
			`Browser had ${sessionpid} stored as pid of ${tab.id} instead of ${cachepid}`);

		let sessionParent = await browser.sessions.getTabValue(tab.id, 'parentPid');
		let cacheParent = CACHE.getValue(tab.id, 'parentPid');
		assert(sessionParent == cacheParent,
			`Browser had ${sessionParent} stored as parent of ${tab.id} instead of ${cacheParent}`);
	});

	console.log(`Done.`);
}

async function SET_PERSISTENT_ID(value) {
	NEXT_PERSISTENT_ID = value;

	browser.storage.local.set({
		next_persistent_id: NEXT_PERSISTENT_ID
	});
}

async function testSidebarInteraction(count = 100, interval = 250) {
	if (!DEBUG_MODE) {
		console.log(`Debug mode not enabled.`);
		return;
	}

	CONT = true;
	let pendingWindow;

	flip = (perc = 0.5) => Math.random() < perc;

	randInWindow = (windowId) => {
		let tabs = CACHE.debug().windows[windowId];
		let i = Math.floor(Math.random() * tabs.length);
		return tabs[i].id;
	}

	randWindow = () => {
		let keys = Object.keys(CACHE.debug().windows);
		if (keys.length == 1 && pendingWindow == null) pendingWindow = browser.windows.create();
		let i = Math.floor(Math.random() * keys.length);
		return Number(keys[i]);
	}

	selectRandomTabs = (windowId) => {
		let set = new Set();
		let tabs = CACHE.debug().windows[windowId];

		while(flip(0.8) && set.size < tabs.length - 1) {
			while(true) {
				let id = randInWindow(windowId);

				if (!set.has(id)) {
					set.add(id);
					break;
				}
			}
		}

		let ret = [];
		set.forEach(v => ret.push(v));
		return ret;
	}

	while(count-- > 0) {
		// can't await queue item since sidebar interaction doesn't await browser operation
		await wait(interval);
		if (pendingWindow != null) {
			await pendingWindow;
			pendingWindow = null;
		}

		if (!CONT) { break; }

		QUEUE.do(async () => {
			let srcWindowId = randWindow();
			let dstWindowId = randWindow();
			setSelectionSourceWindow(srcWindowId);
			let ids = selectRandomTabs(srcWindowId);
			let target = randInWindow(dstWindowId);

			if (flip()) {
				console.log(`Moving next to ${target} [${srcWindowId}]->[${dstWindowId}] [${ids.toString()}]`);
				await sidebarDropMoving(ids, target, flip(), dstWindowId);
			} else {
				console.log(`Parenting to ${target} [${srcWindowId}]->[${dstWindowId}] [${ids.toString()}]`);
				await sidebarDropParenting(ids, target, dstWindowId);
			}
		});
	}
}

async function brickData(count = -1) {
	randTab = () => {
		let tabs = CACHE.debug().tabs;
		let i = Math.floor(Math.random() * Object.keys(CACHE.debug().tabs).length);
		return tabs[ Object.keys(tabs)[i] ];
	}

	if (count == -1) count = Math.floor(Math.random() * Object.keys(CACHE.debug().tabs).length);
	let set = new Set();

	while (set.size < count) {
		let tab = randTab();

		while(set.has(tab.id)) tab = randTab();

		let rand = Math.random();

		if (rand < 0.3) {
			CACHE.removeValue(tab.id, 'parentPid');
		} else if (rand < 0.6) {
			CACHE.removeValue(tab.id, 'pid');
		} else {
			CACHE.removeValue(tab.id, 'parentPid');
			CACHE.removeValue(tab.id, 'pid');
		}

		set.add(tab.id);
	}
}