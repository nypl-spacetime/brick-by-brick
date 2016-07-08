var R = require('ramda')
var H = require('highland')

module.exports = (db) => {
  console.log('Initializing collections and items database tables')

  var collections = require('../data/collections.json')
    .filter((collection) => !collection.exclude)
    .map(R.omit('exclude'))

  db.fillTable('collections', collections, (err) => {
    if (err) {
      console.error('Error filling collections table: ', err.message)
      process.exit(1)
    }

    // Load collection items for each collection in collections.json
    //   extent item data with UUID of collection itself
    H(collections)
      .map((collection) => require(`../data/${collection.uuid}.json`)
        .map((item) => R.merge(item, {collection: collection.uuid}))
      )
      .flatten()
      .filter((item) => item.imageLink)
      .map((item) => {
        item.imageLink = item.imageLink.filter((imageLink) => {
          return imageLink.includes('&t=w&')
        })[0]

        return item
      })
      .map((item) => ({
        uuid: item.uuid,
        title: item.title,
        image_id: item.imageID,
        image_link: item.imageLink,
        collection: item.collection
      }))
      .toArray((items) => {
        db.fillTable('items', items, (err) => {
          if (err) {
            console.error('Error filling items table: ', err.message)
            process.exit(1)
          }

          console.log('Done initializing tables...')
        })
      })
  })
}
