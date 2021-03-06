import { UUID } from "@berhalak/js";
import { wait } from "@berhalak/monads";
import { Packer } from "packer-js";

export {
	Dictionary
}

export function uid() {
	return UUID();
}

export interface SilosPersistance {
	save(type: string, id: string, model: any): Promise<void>;
	read(type: string, id: string): Promise<any>;
	list(type: string): Promise<any[]>;
}

class DefaultPersistance implements SilosPersistance {
	map = new Map<string, Map<string, any>>();

	save(type: string, id: string, model: any): Promise<void> {
		if (!this.map.has(type)) this.map.set(type, new Map());
		this.map.get(type).set(id, model);
		return Promise.resolve();
	}

	read(type: string, id: string): Promise<any> {
		const model = this.map.get(type)?.get(id);
		return Promise.resolve(model);
	}

	list(type: string): Promise<any> {
		const all = [...this.map.get(type)?.values()];
		return Promise.resolve(all);
	}
}

function getId(model: any) {
	return typeof model.id == 'function' ? model.id() : (model.id ?? model._id);
}

function getType(model: any) {
	if (model && model.constructor && typeof model == 'object') {
		return model.constructor['$type'] ?? model.constructor.name;
	}
	if (typeof model == 'function' && model.name) {
		return model.name;
	}
	if (typeof model == 'function' && model.$type) {
		return model.type;
	}
	return model.type ?? "Object";
}

export class Silos {
	static async clear(force = false) {
		if (force) {
			this.instance.ins.clear();
			this.instance.map.clear();
			return;
		}
		for (let actor of this.instance.ins.values()) {
			if (typeof actor.onSleep == 'function') {
				await actor.onSleep();
			}
		}
		this.instance.ins.clear();
	}

	static persistance: SilosPersistance = new DefaultPersistance();

	static instance: Silos = new Silos();

	constructor(sil?: Silos) {
		if (sil) {
			this.map = sil.map;
		}
	}

	// constructors
	map = new Map<string, any>();

	// instances
	ins = new Map<string, any>();

	static register(...args: any[]) {
		for (let a of args) {
			this.instance.map.set(a.name, a);
			Packer.register(a);
		}
	}

	static id<T>(c: Constructor<T>) {
		return c.name + ":" + UUID();
	}

	static activeCalls: any = {};

	async invoke(name: string, id: string, method: string, args: any[]) {
		let inst = this.ins.get(id);
		if (!inst) {
			const ctr = this.map.get(name);
			inst = new ctr(id);
			this.ins.set(id, inst);
			if (typeof inst.onWake == 'function') {
				await inst.onWake();
			}
		}
		const key = `${name}-${id}`;
		while (key in Silos.activeCalls) {
			await Silos.activeCalls[key];
		}
		// call actor
		const currentCall = inst[method].call(inst, args);
		// set active call by id
		Silos.activeCalls[key] = currentCall;
		// await current call
		const result = await currentCall;
		if (Silos.activeCalls[key] == currentCall) {
			delete Silos.activeCalls[key];
		}
		return result;
	}

	async fresh<T>(model: T) {
		const data = await Silos.persistance.read(getType(model), getId(model));
		if (!data) return;
		Packer.register(model);
		const unpacked = Packer.unpack<T>(data);
		Object.assign(model, unpacked);
	}

	async read<T>(model: T): Promise<T>
	async read<T>(ctr: Constructor<T>, id: string): Promise<T>
	async read<T>(...args: any[]): Promise<T> {
		if (args.length == 1) {
			const model = args[0];
			Packer.register(model);
			return await wait(Silos.persistance.read(getType(model), getId(model)))
				.map((x: any) => Packer.unpack<T>(x))
				.value();
		} else {
			const ctr = args[0];
			const id = args[1];
			Packer.register(ctr);
			return await wait(Silos.persistance.read(getType(ctr), id))
				.do((x: any) => console.log(x))
				.map((x: any) => Packer.unpack<T>(x))
				.value();
		}
	}

	async snap<T>(model: any) {
		const packed = Packer.pack(model);
		await Silos.persistance.save(getType(model), getId(model), packed);
	}

	async list<T>(type: Constructor<T>) {
		return (await Silos.persistance.list(getType(type))).map(x => Packer.unpack<T>(x));
	}
}

const getMethods = (obj: any) => {
	let properties = new Set<string>();
	let currentObj = obj;

	Object.getOwnPropertyNames(currentObj).map(item => properties.add(item))

	const result = [...properties.keys()].filter(item => typeof obj[item] === 'function' && item != 'constructor');
	return result;
}

export async function snap(model: any) {
	await Silos.instance.snap(model);
}

export async function read<T>(model: T) {
	return await Silos.instance.read(model);
}

export async function list<T>(type: Constructor<T>) {
	return await Silos.instance.list(type);
}

export async function fresh<T>(model: T) {
	await Silos.instance.fresh(model);
}

export class Reference {
	$factory = '';
	id = '';
	unpack(data: any) {
		Object.assign(this, data);
		return ref(Silos.instance.map.get(this.$factory), this.id);
	}

	constructor(model?: any) {
		if (model && model.$factory) {
			this.$factory = model.$factory;
			this.id = model.id;
		}
	}
}

type Constructor<T> = new (...args: any[]) => T;


export function ref<T>(factory: Constructor<T>, id?: string): T {
	const proxy = {} as any;

	id = id ?? factory.name;

	const proto = factory.prototype as any;

	Silos.register(factory);

	const $data: any = { m: [], n: factory.name }

	// get all methods
	for (let key of getMethods(proto)) {
		proxy[key] = async function (...args: any[]) {
			return await Silos.instance.invoke(factory.name, id, key, args);
		}
		$data.m.push(key);
	}

	const inst: any = {
		id: id ?? "",
		$factory: factory.name,
		$type: "Reference"
	};

	Object.setPrototypeOf(inst, proxy);

	return inst as T;
}

export async function load<T>(factory: Constructor<T>, id: string): Promise<T> {
	const model = await Silos.instance.read(factory, id);
	return model ?? new factory(id);
}


export interface ActorConstructor {
	new <T>(type: Constructor<T>, id?: string): T;
}

export const Actor: ActorConstructor = function <T>(type: Constructor<T>, id?: string) {
	return ref(type, id);
} as any;

export const Root: ActorConstructor = function <T>(type: Constructor<T>, id?: string) {
	return ref(type, id);
} as any;