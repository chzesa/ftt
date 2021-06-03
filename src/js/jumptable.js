class JumpTable {
	constructor() {
		this.map = new Map();
		this.map.set(-1, {
			depth: -1,
			id: -1,
			jt: [-1]
		});
	}

	depth(id) {
		let n = this.map.get(id);
		if (n.depth < -1) n.depth = this.depth(n.jt[0]) + 1;

		return n.depth;
	}

	invalidate(id) {
		let n = this.map.get(id);
		n.jt.length = 1;
		n.depth = -2;
	}

	lca(idA, idB) {
		let nA = this.map.get(idA);
		let nB = this.map.get(idB);

		assert(nA != null && nB != null, `Couldn't find node ${idA} (${nA}) or ${idB} (${nB})`);

		if (this.depth(nB.id) < this.depth(nA.id)) {
			let temp = nA;
			nA = nB;
			nB = temp;
		}

		nB = this.__ancestor(nB.id, nB.depth - nA.depth);

		for (let i = Math.ceil(Math.log2(this.depth(nA.id))); i >= 0; i--) {
			let p = Math.pow(2, i);
			let nextA = this.__ancestor(nA.id, p);
			let nextB = this.__ancestor(nB.id, p);
			if (nextA != nextB) {
				nA = nextA;
				nB = nextB;
			}
		}

		if (nA == nB) return nA.id;
		return nA.jt[0];
	}

	ancestor(id, k) {
		if (k == 0) return id;

		let n = this.map.get(id);

		for (let i = 0; i < 31; i++) {
			if (k & 1 << i) {
				if (n.jt[i] == null) {
					let p = Math.pow(2, i - 1);
					n.jt[i] = this.ancestor(this.ancestor(n.id, p), p);
				}

				n = this.map.get(n.jt[i]);
			}
		}

		return n.id;
	}

	__ancestor(id, k) {
		return this.map.get(this.ancestor(id, k));
	}

	addNode(id, parentId) {
		assert(this.map.get(id) == null, `Created duplicate of existing node ${id}`);
		this.map.set(id, {
			depth: -2,
			id,
			jt: [parentId]
		});
	}

	setParent(id, parentId) {
		this.invalidate(id);
		this.map.get(id).jt[0] = parentId;
	}

	remove(id) {
		this.map.delete(id);
	}

	clear() {
		let jt = this;
		this.map.forEach((v, k) => jt.invalidate(k));
	}

	check() {
		let m = this.map;
		let jt = this;
		this.map.forEach((v, k) => {
			v.jt.forEach(id => {
				assert(m.get(id) !== undefined, `Found id ${id} in jt of ${k} which doesn't exist in map`);
				if (k != -1) assert(jt.depth(k) > jt.depth(id),
					`Parent depth ${id} higher than descendant depth ${k} (${jt.depth(k)})`);
			})
		});
	}
}
