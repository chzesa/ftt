class TreeStructure {
	constructor() {
		this.map = {};
		this.array = [];
		this.map[-1] = {
			id: -1
			, parentId: null
			, parent: null
			, childNodes: []
			, index: -1
		};
		this.recordDeltas = false;
	}

	debug() {
		return {
			map: this.map,
			array: this.array
		}
	}

	beginRecord() {
		this.recordDeltas = true;
		this.deltas = [];
	}

	endRecord() {
		this.recordDeltas = false;
		return this.deltas;
	}

	asDeltas() {
		let ret = [];

		this.array.forEach(node => ret.push({
			id: node.id,
			parentId: node.parentId,
			index: node.index
		}));

		return ret;
	}

	get(id) { return this.map[id]; }

	getIndexed(i) { return this.array[i]; }

	ancestorIds(id) {
		let node = this.map[id];
		let ancestors = [];

		while (node.parentId != null) {
			node = node.parent;
			ancestors.push(node.id);
		}

		return ancestors;
	}

	subtreeArray(id) {
		let root = this.map[id];
		let ids = [];

		function recurse(node) {
			ids.push(node.id);

			node.childNodes.forEach(child => {
				if (child == null) {
					console.log(`Node id ${node.id} had null child`);
					return;
				}
				recurse(child);
			});
		}

		recurse(root);
		return ids;
	}

	findLastDescendant(id) {
		let node = this.map[id];
		while (node.childNodes.length > 0) {
			node = node.childNodes[node.childNodes.length - 1];
		}

		return node.id;
	}

	move(id, toIndex) {
		let node = this.map[id];
		let fromIndex = node.index;

		if (fromIndex == toIndex) return;
		if (node.childNodes.length > 0) {
			throw new Error(`Cannot move a node with children`);
		}

		let displacedIndex = fromIndex < toIndex ? toIndex + 1 : toIndex;
		let parent;
		let childIndex;

		if (displacedIndex >= this.array.length) {
			parent = this.map[-1];
			childIndex = parent.childNodes.length;
		} else {
			let displaced = this.array[displacedIndex];
			parent = displaced.parent;
			childIndex = parent.childNodes.indexOf(displaced);
		}

		if (node.parentId == parent.id && fromIndex < toIndex) {
			childIndex--;
		}

		this.array.splice(fromIndex, 1);
		this.array.splice(toIndex, 0, node);

		let a = Math.min(fromIndex, toIndex);
		let b = Math.max(fromIndex, toIndex) + 1;
		b = Math.min(b, this.array.length);
		for (let i = a; i < b; i++) {
			this.array[i].index = i;
		}

		this.__changeParent(node, parent, childIndex);
	}

	changeParent(id, parentId) {
		let node = this.map[id];
		if (node.parentId == parentId) return;
		// todo: check if parent is legal
		let parent = this.map[parentId];

		// todo: binary search
		let index = 0;
		while (index < parent.childNodes.length
			&& parent.childNodes[index].index < node.index) {
			index++;
		}

		this.__changeParent(node, parent, index);
	}

	new(id) {
		if (id == null) throw new Error(`Attempt to create a node with null id.`);
		if (this.map[id] != null) throw new Error(`Node ${id} already exists.`);

		let node = {};
		node.id = id;
		node.childNodes = [];
		node.index = this.array.length;
		this.array.push(node);
		this.map[id] = node;

		this.__changeParent(node, this.map[-1], -1);

		return node;
	}

	__changeParent(node, parent, index) {
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

		if (this.recordDeltas) this.deltas.push({
			id: node.id,
			parentId: parent.id,
			index: node.index
		});
	}

	promoteFirstChild(id) {
		let node = this.map[id];

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

		if (this.recordDeltas) children.forEach(child => this.deltas.push({
			id: child.id,
			parentId: child.parentId,
			index: child.index
		}));

		node.childNodes = [];

		let parent = node.parent;
		let index = parent.childNodes.indexOf(node);
		parent.childNodes.splice(index + 1, 0, firstChild);
	}

	remove(id) {
		let node = this.map[id];

		this.array.splice(node.index, 1);
		let n = this.array.length;
		let i = node.index;
		while (i < n) this.array[i++].index--;

		this.promoteFirstChild(node.id);
		let children = node.parent.childNodes;
		let indexInParent = children.indexOf(node);
		children.splice(indexInParent , 1);

		delete this.map[id];
	}
}
