function newTreeStructure() {
	const self = {};
	const map = {};
	const array = [];

	map[-1] = {
		id: -1
		, parentId: null
		, parent: null
		, childNodes: []
		, index: -1
	}

	self.debug = function() {
		return {
			map,
			array
		}
	}

	self.get = function (id) {
		return map[id];
	}

	self.getIndexed = function (i) {
		return array[i];
	}

	self.ancestorIds = function(id) {
		let node = map[id];
		let ancestors = [];

		while (node.parentId != null) {
			node = node.parent;
			ancestors.push(node.id);
		}

		return ancestors;
	}

	self.subtreeArray = function(id) {
		let root = map[id];
		let ids = [];

		function recurse(node) {
			ids.push(node.id);

			node.childNodes.forEach(child => {
				recurse(child);
			});
		}

		recurse(root);
		return ids;
	}

	self.findLastDescendant = function (id) {
		let node = map[id];
		while (node.childNodes.length > 0) {
			node = node.childNodes[node.childNodes.length - 1];
		}

		return node.id;
	}

	self.move = function (id, toIndex) {
		let node = map[id];
		let fromIndex = node.index;

		if (fromIndex == toIndex) return;
		if (node.childNodes.length > 0) {
			throw new Error(`Cannot move a node with children`);
		}

		let displacedIndex = fromIndex < toIndex ? toIndex + 1 : toIndex;
		let parent;
		let childIndex;

		if (displacedIndex >= array.length) {
			parent = map[-1];
			childIndex = parent.childNodes.length;
		} else {
			let displaced = array[displacedIndex];
			parent = displaced.parent;
			childIndex = parent.childNodes.indexOf(displaced);
		}

		if (node.parentId == parent.id && fromIndex < toIndex) {
			childIndex--;
		}

		changeParent(node, parent, childIndex);

		array.splice(fromIndex, 1);
		array.splice(toIndex, 0, node);

		let a = Math.min(fromIndex, toIndex);
		let b = Math.max(fromIndex, toIndex) + 1;
		b = Math.min(b, array.length);
		for (let i = a; i < b; i++) {
			array[i].index = i;
		}
	}

	self.changeParent = function(id, parentId) {
		let node = map[id];
		if (node.parentId == parentId) return;
		// todo: check if parent is legal
		let parent = map[parentId];

		// todo: binary search
		let index = 0;
		while (index < parent.childNodes.length
			&& parent.childNodes[index].index < node.index) {
			index++;
		}

		changeParent(node, parent, index);
	}

	self.new = function (id) {
		if (id == null) throw new Error(`Attempt to create a node with null id.`);
		if (map[id] != null) throw new Error(`Node ${id} already exists.`);

		let node = {};
		node.id = id;
		node.childNodes = [];
		node.index = array.length;
		array.push(node);
		map[id] = node;

		changeParent(node, map[-1], -1);

		return node;
	}

	function changeParent(node, parent, index) {
		let oldParent = node.parent;

		if (oldParent != null) {
			let index = oldParent.childNodes.indexOf(node);
			oldParent.childNodes.splice(index, 1);
		}

		node.parentId = parent.id;
		node.parent = parent;
		let children = parent.childNodes;

		if (index < 0 || index >= children.length) {
			children.push(node);
		}
		else {
			children.splice(index, 0, node);
		}
	}

	self.promoteFirstChild = function (id) {
		let node = map[id];

		let children = node.childNodes;
		let n = children.length;
		if (n == 0) return;

		let firstChild = children[0];
		firstChild.parentId = node.parentId;
		firstChild.parent = node.parent;
		let newChildren = firstChild.childNodes;

		for (let i = 1; i < n; i++) {
			let child = children[i];
			child.parentId = firstChild.id;
			child.parent = firstChild;
			newChildren.push(child);
		}

		node.childNodes = [];

		let parent = node.parent;
		let index = parent.childNodes.indexOf(node);
		parent.childNodes.splice(index + 1, 0, firstChild);
	}

	self.remove = function (id) {
		let node = map[id];

		array.splice(node.index, 1);
		let n = array.length;
		let i = node.index;
		while (i < n) array[i++].index--;

		self.promoteFirstChild(node.id);
		let children = node.parent.childNodes;
		let indexInParent = children.indexOf(node);
		children.splice(indexInParent , 1);

		delete map[id]
	}

	return self;
}
