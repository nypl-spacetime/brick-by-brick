const R = require('ramda')

const filterNullValues = (obj) => R.pickBy((val, key) => val !== null, obj)

const serializeItem = (row) => filterNullValues({
  provider: row.provider,
  id: row.item_id,
  data: row.item_data,
  collection: filterNullValues({
    id: row.collection_id,
    title: row.collection_title,
    url: row.collection_url,
    tasks: serializeCollectionTasks(row.tasks, row.submissions_needed),
    data: row.collection_data
  })
})

const serializeTask = (row) => filterNullValues({
  task: row.id,
  description: row.description
})

const serializeTasks = (rows) => rows.map(serializeTask)

const serializeCollectionTasks = (tasks, submissionsNeeded) =>
  R.zip(tasks, submissionsNeeded)
    .map((task) => ({
      task: task[0],
      submissionsNeeded: task[1]
    }))

const serializeCollection = (row) => filterNullValues({
  provider: row.provider,
  id: row.id,
  title: row.title,
  url: row.url,
  data: row.data,
  tasks: serializeCollectionTasks(row.tasks, row.submissions_needed)
})

const serializeCollections = (rows) => rows.map(serializeCollection)

const serializeSubmission = (row) => filterNullValues({
  collection: {
    id: row.collection_id
  },
  item: {
    provider: row.item_provider,
    id: row.item_id,
    data: row.item_data
  },
  task: row.task_id,
  step: row.step,
  skipped: row.skipped ? true : null,
  data: row.data,
  dateCreated: row.date_created,
  dateModified: row.date_modified
})

const serializeSubmissions = (rows) => rows.map(serializeSubmission)

module.exports = {
  item: serializeItem,
  task: serializeTask,
  tasks: serializeTasks,
  collection: serializeCollection,
  collections: serializeCollections,
  submission: serializeSubmission,
  submissions: serializeSubmissions
}
