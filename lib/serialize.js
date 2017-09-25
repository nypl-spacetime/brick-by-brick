const R = require('ramda')

const filterNullValues = (obj) => R.pickBy((val, key) => val !== null, obj)

const serializeDate  = (date) => {
  if (date && date.toJSON) {
    return date.toJSON().slice(0, 19) + 'Z'
  }
}

const serializeItem = (row) => {
  let item = filterNullValues({
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

  if (row.submission_data || row.submission_skipped) {
    item.submission = filterNullValues({
      data: row.submission_data,
      skipped: row.submission_skipped ? true : null,
      dateCreated: serializeDate(row.submission_date_created),
      dateModified: serializeDate(row.submission_date_modified)
    })
  }

  return item
}

const serializeItems = (rows) => rows.map(serializeItem)

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
  submissions: R.toPairs(R.groupBy(R.prop('userId'), row.submissions || [row.submission]))
    .map((pair) => ({
      userId: parseInt(pair[0]),
      steps: pair[1]
        .sort((a, b) => a.stepIndex - b.stepIndex)
        .map(R.omit(['userId']))
        .map((step) => Object.assign(step, {
          dateCreated: serializeDate(step.dateCreated),
          dateModified: serializeDate(step.dateModified)
        }))
    })),
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
  items: serializeItems,
  task: serializeTask,
  tasks: serializeTasks,
  collection: serializeCollection,
  collections: serializeCollections,
  submission: serializeSubmission,
  submissions: serializeSubmissions
}
