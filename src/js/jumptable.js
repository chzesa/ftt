class JumpTable {
	constructor() {
		this.map = {};
		this.map[-1] = {
			depth: -1,
			id: -1,
			jt: [-1]
		}
	}

	depth(id) {
		let n = this.map[id];
		if (n.depth < -1) n.depth = this.depth(n.jt[0]) + 1;

		return n.depth;
	}

	invalidate(id) {
		let n = this.map[id];
		n.jt.length = 1;
		n.depth = -2;
	}

	lca(idA, idB) {
		let nA = this.map[idA];
		let nB = this.map[idB];

		if(nA == null || nB == null)
			throw new Error(`Couldn't find node ${idA} (${nA}) or ${idB} (${nB}) `)

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

		let n = this.map[id];

		for (let i = 0; i < 31; i++) {
			if (k & 1 << i) {
				if (n.jt[i] == null) {
					let p = Math.pow(2, i - 1);
					n.jt[i] = this.ancestor(this.ancestor(n.id, p), p);
				}

				n = this.map[n.jt[i]];
			}
		}

		return n.id;
	}

	__ancestor(id, k) {
		return this.map[this.ancestor(id, k)];
	}

	addNode(id, parentId) {
		this.map[id] = {
			depth: -2,
			id,
			jt: [parentId]
		};
	}

	setParent(id, parentId) {
		this.invalidate(id);
		this.map[id].jt[0] = parentId;
	}

	remove(id) {
		delete this.map[id];
	}

	clear() {
		for (let k in Object.keys(this.map))
			this.invalidate(k);
	}

	check() {
		for (let k in Object.keys(this.map)) {
			let n = this.map[k];
			if (n == null) {
				delete this.map[k]
				continue;
			}
			let m = this.map;

			n.jt.forEach(id => {
				if (m[id] === undefined) {
					throw new Error(`Found id ${id} in jt of ${n.id} which doesn't exist in map`);
				}
			})
		}
	}
}
