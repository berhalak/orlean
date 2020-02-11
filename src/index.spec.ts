import { Packer } from "packer-js"
import { Silos, ref, fresh, snap, load } from './index';

test('sample test', async () => {

	class Actor {
		id = "actor";
		static instanceCount = 0;
		constructor() {
			Actor.instanceCount++;
		}
		counter = 0;
		async onWake() {
			// read initial state
			await fresh(this);
		}
		async onSleep() {
			// read initial state
			await snap(this);
		}
		async count() {
			this.counter++;
			return this.counter;
		}
	}

	Silos.register(Actor);

	const a = ref(Actor, "actor");

	expect(await a.count()).toBe(1);
	expect(await a.count()).toBe(2);

	const b = ref(Actor, "actor");

	expect(await b.count()).toBe(3);
	expect(await b.count()).toBe(4);
	expect(await a.count()).toBe(5);

	expect(Actor.instanceCount).toBe(1);
	await Silos.clear();

	const c = ref(Actor, "actor");

	expect(await a.count()).toBe(6);
	expect(await b.count()).toBe(7);
	expect(await c.count()).toBe(8);
	expect(Actor.instanceCount).toBe(2);




})

test('model test', async () => {
	await Silos.clear(true);

	class Model {
		constructor(private id: string) {

		}
		name = '';
		toString() {
			return this.name;
		}
	}

	const bob = new Model("bob");
	const john = new Model("john");

	bob.name = "Bob";
	john.name = "John";

	await snap(bob); await snap(john);

	const loadedBob = await load(Model, "bob");
	const loadedJohn = await load(Model, "john");

	expect(bob.toString()).toBe(loadedBob.toString());
});