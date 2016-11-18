const R = require('ramda')

const filterNullValues = (obj) => R.pickBy((val, key) => val !== null, obj)

const serializeItem = (row) => filterNullValues({
  id: row.item_id,
  data: row.item_data,
  organization: {
    id: row.organization_id
  },
  collection: filterNullValues({
    id: row.collection_id,
    title: row.collection_title,
    url: row.collection_url,
    tasks: serializeCollectionTasks(row.tasks, row.submissions_needed),
    data: row.collection_data
  })
})

const serializeOrganization = (row) => filterNullValues({
  id: row.id,
  title: row.title
})

const serializeOrganizations = (rows) => rows.map(serializeOrganization)

const serializeTask = (row) => filterNullValues({
  id: row.id,
  description: row.description
})

const serializeTasks = (rows) => rows.map(serializeTask)

const serializeCollectionTasks = (tasks, submissionsNeeded) =>
  R.zip(tasks, submissionsNeeded)
    .map((task) => ({
      id: task[0],
      submissionsNeeded: task[1]
    }))

const serializeCollection = (row) => filterNullValues({
  id: row.id,
  title: row.title,
  url: row.url,
  data: row.data,
  organization: {
    id: row.organization_id
  },
  tasks: serializeCollectionTasks(row.tasks, row.submissions_needed)
})

const serializeCollections = (rows) => rows.map(serializeCollection)

const serializeSubmission = (row) => filterNullValues({
  step: row.step,
  skipped: row.skipped ? true : null,
  data: row.data,
  dateCreated: row.date_created,
  dateModified: row.date_modified,
  task: {
    id: row.task_id
  },
  collection: {
    id: row.collection_id
  },
  organization: {
    id: row.organization_id
  },
  item: {
    id: row.item_id,
    data: row.item_data
  }
})

const serializeSubmissions = (rows) => rows.map(serializeSubmission)

module.exports = {
  organizations: serializeOrganizations,
  item: serializeItem,
  task: serializeTask,
  tasks: serializeTasks,
  collection: serializeCollection,
  collections: serializeCollections,
  submission: serializeSubmission,
  submissions: serializeSubmissions
}
