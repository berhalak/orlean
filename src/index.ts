import { UUID } from "@berhalak/js";
import { wait } from "@berhalak/monads";
import { Packer } from "packer-js";


export interface SilosPersistance {
    save(id: string, model: any): Promise<void>;
    read(id: string): Promise<any>;
}

class DefaultPersistance implements SilosPersistance {
    map = new Map<string, any>();

    save(id: string, model: any): Promise<void> {
        this.map.set(id, model);
        return Promise.resolve();
    }

    read(id: string): Promise<any> {
        return Promise.resolve(this.map.get(id));
    }
}

function getId(model: any) {
    return typeof model.id == 'function' ? model.id() : model.id ?? model._id;
}

export class Silos {
    static async clear() {
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
        return await inst[method].call(inst, args);
    }

    async fresh<T>(model: T) {
        const data = await Silos.persistance.read(getId(model));
        if (!data) return;
        Packer.register(model);
        const unpacked = Packer.unpack<T>(data);
        Object.assign(model, unpacked);
    }

    async read<T>(model: T) {
        Packer.register(model);
        return await wait(Silos.persistance.read(getId(model)))
            .map(x => Packer.unpack<T>(x))
            .value();
    }

    async snap<T>(model: any) {
        const packed = Packer.pack(model);
        await Silos.persistance.save(getId(model), packed);
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

export async function fresh<T>(model: T) {
    await Silos.instance.fresh(model);
}

export class Reference {
    unpack() {

    }
}

type Constructor<T> = new (...args: any[]) => T;

export function ref<T>(factory: Constructor<T>, id?: string): T {
    const proxy = {} as any;

    id = id ?? factory.name;

    const proto = factory.prototype as any;


    // get all methods
    for (let key of getMethods(proto)) {
        proxy[key] = async function (...args: any[]) {
            return await Silos.instance.invoke(factory.name, id, key, args);
        }
    }

    const inst: any = {
        id: id ?? "",
        $type: "Reference"
    };

    Object.setPrototypeOf(inst, proxy);

    return inst as T;
}