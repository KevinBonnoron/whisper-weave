/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1335902081")

  // add field
  collection.fields.addAt(5, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_346588325",
    "hidden": false,
    "id": "relation3264838865",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "assistant",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1335902081")

  // remove field
  collection.fields.removeById("relation3264838865")

  return app.save(collection)
})
