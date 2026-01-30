/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1337100956")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX `idx_rLQcY8cF4J` ON `assistant_memories` (\n  `assistant`,\n  `userId`\n)"
    ],
    "name": "assistant_memories"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1337100956")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX `idx_rLQcY8cF4J` ON `memories` (\n  `assistant`,\n  `userId`\n)"
    ],
    "name": "memories"
  }, collection)

  return app.save(collection)
})
