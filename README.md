# orlean.js
Typescript orlean like framework

``` ts
class Actor {
      id = "actor";
      static instanceCount = 0;
      constructor() {
          Actor.instanceCount++;
      }
      counter = 0;
      async count() {
          await fresh(this);
          this.counter++;
          await snap(this);
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
```

