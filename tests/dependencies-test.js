const { assert } = require('chai');
const getLoader = require('../dependencies');
const components = require('../components');


describe('Dependency logic', function () {

	/** @type {import("../dependencies").Components} */
	const components = {
		languages: {
			'a': {
				alias: 'a2'
			},
			'b': {
				alias: 'b2'
			},
			'c': {
				require: 'a',
				optional: ['b', 'e']
			},
			'd': {
				require: ['c', 'b'],
				alias: 'xyz'
			},
		},
		pluginsOrSomething: {
			'e': {
				modify: 'a'
			},
		}
	};

	/**
	 * Returns the ids of `getLoader`.
	 *
	 * @param {string[]} load
	 * @param {string[]} [loaded]
	 * @returns {string[]}
	 */
	function getIds(load, loaded) {
		return getLoader(components, load, loaded).getIds();
	}

	describe('Returned ids', function () {

		it('- should load requirements', function () {
			assert.sameMembers(getIds(['d']), ['a', 'b', 'c', 'd']);
		});

		it('- should not load already loaded requirements if not necessary', function () {
			assert.sameMembers(getIds(['d'], ['a', 'b']), ['c', 'd']);
		});

		it('- should load already loaded requirements if requested', function () {
			assert.sameMembers(getIds(['a', 'd'], ['a', 'b']), ['a', 'c', 'd']);
		});

		it('- should reload modified components', function () {
			assert.sameMembers(getIds(['e'], ['a', 'b', 'c', 'd']), ['a', 'c', 'd', 'e']);
		});

		it('- should work with empty load', function () {
			assert.sameMembers(getIds([], ['a', 'b', 'c', 'd']), []);
		});

		it('- should return unknown ids as is', function () {
			assert.sameMembers(getIds(['c', 'foo'], ['bar']), ['foo', 'c', 'a']);
		});

		it('- should throw on unknown dependencies', function () {
			assert.throws(() => {
				/** @type {import("../dependencies").Components} */
				const circular = {
					languages: {
						a: {
							require: 'c'
						},
						b: 'B'
					}
				};
				getLoader(circular, ['a']).getIds();
			});
		});

	});

	describe('Load order', function () {

		// Note: The order of a and b isn't defined, so don't add any test with both of them being loaded here

		it('- should load components in the correct order (require)', function () {
			assert.deepStrictEqual(getIds(['c']), ['a', 'c']);
		});

		it('- should load components in the correct order (modify)', function () {
			assert.deepStrictEqual(getIds(['e', 'a']), ['a', 'e']);
		});

		it('- should load components in the correct order (optional)', function () {
			assert.deepStrictEqual(getIds(['c', 'b'], ['a']), ['b', 'c']);
		});

		it('- should load components in the correct order (require + optional)', function () {
			assert.deepStrictEqual(getIds(['d'], ['a']), ['b', 'c', 'd']);
		});

		it('- should load components in the correct order (require + modify + optional)', function () {
			assert.deepStrictEqual(getIds(['d', 'e'], ['b']), ['a', 'e', 'c', 'd']);
		});

	});

	describe('Aliases', function () {

		it('- should resolve aliases in the list of components to load', function () {
			assert.sameMembers(getIds(['xyz']), ['a', 'b', 'c', 'd']);
		});

		it('- should resolve aliases in the list of loaded components', function () {
			assert.sameMembers(getIds(['d'], ['a', 'a2', 'b2']), ['c', 'd']);
		});

		it('- should throw on duplicate aliases', function () {
			assert.throws(() => {
				/** @type {import("../dependencies").Components} */
				const circular = {
					languages: {
						a: {
							alias: 'c'
						},
						b: {
							alias: 'c'
						}
					}
				};
				getLoader(circular, ['a']).getIds();
			});
		});

		it('- should throw on aliases which are components', function () {
			assert.throws(() => {
				/** @type {import("../dependencies").Components} */
				const circular = {
					languages: {
						a: {
							alias: 'b'
						},
						b: 'B'
					}
				};
				getLoader(circular, ['a']).getIds();
			});
		});

	});

	describe('Circular dependencies', function () {

		it('- should throw on circular dependencies', function () {
			assert.throws(() => {
				/** @type {import("../dependencies").Components} */
				const circular = {
					languages: {
						a: {
							require: 'b'
						},
						b: {
							optional: 'a'
						}
					}
				};
				getLoader(circular, ['a']).getIds();
			});
		});

	});

	describe('Async loading', function () {

		it('- should load components in the correct order', async function () {

			/** @type {import("../dependencies").Components} */
			const localComponents = {
				languages: {
					'a': {},
					'b': {
						require: 'a'
					},
					'c': {
						require: 'b'
					}
				}
			};

			/** @type {string[]} */
			const actualLoadOrder = [];
			/** @type {string[]} */
			const actualResolveOrder = [];

			/**
			 *
			 * @param {string} id
			 * @returns {Promise<void>}
			 */
			function loadComp(id) {
				actualLoadOrder.push(id);

				// the idea is that the components which have to be loaded first, take the longest, so if all were to
				// start getting loaded at the same time, their order would be the reverse of the expected order.
				let delay;
				if (id === 'a') {
					delay = 30;
				} else if (id === 'b') {
					delay = 20;
				} else if (id === 'c') {
					delay = 10;
				}

				return new Promise((resolve) => {
					setTimeout(() => {
						actualResolveOrder.push(id);
						resolve();
					}, delay);
				});
			}

			const loader = getLoader(localComponents, ['c']);

			await loader.load(id => loadComp(id), {
				series: async (before, after) => {
					await before;
					await after();
				},
				parallel: async (values) => {
					await Promise.all(values);
				}
			});

			assert.deepStrictEqual(actualLoadOrder, ['a', 'b', 'c'], 'actualLoadOrder:');
			assert.deepStrictEqual(actualResolveOrder, ['a', 'b', 'c'], 'actualResolveOrder:');
		});

	});

});

describe('components.json', function () {

	it('- should be valid', function () {
		try {
			getLoader(components, Object.keys(components.languages).filter(k => k != 'meta')).getIds();
		} catch (error) {
			assert.fail(error.toString());
		}
	});

});
