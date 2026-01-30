/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_346588325")

  // add field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "bool580149238",
    "name": "memoryEnabled",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_346588325")

  // remove field
  collection.fields.removeById("bool580149238")

  return app.save(collection)
})
