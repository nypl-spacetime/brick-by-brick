'use strict'

var argv = require('minimist')(process.argv.slice(2))
var H = require('highland')
var R = require('ramda')
var express = require('express')
var cors = require('cors')
var bodyParser = require('body-parser')
var brickByBrickPackage = require('./package')
var app = express()
var server = require('http').createServer(app)
var io = require('socket.io')(server)

var config = require('./base-config.json')
var userConfig = Object.assign({}, config)

var configFound = false
if (process.env.BRICK_BY_BRICK_API_CONFIG || argv.config) {
  userConfig = require(process.env.BRICK_BY_BRICK_API_CONFIG || argv.config)
  configFound = true
}

const envVar = (key1, key2) => `${key1.toUpperCase()}_${key2.toUpperCase()}`

Object.keys(config).forEach((key1) => {
  Object.keys(config[key1]).forEach((key2) => {
    config[key1][key2] = process.env[envVar(key1, key2)] || userConfig[key1][key2] || config[key1][key2]

    if (process.env[envVar(key1, key2)]) {
      configFound = true  
    }    
  })
})

if (!configFound) {
  console.error('No config found, set BRICK_BY_BRICK_API_CONFIG, use --config, or set per-item environment variables')
  process.exit(1)
}

var oauth = require('express-pg-oauth')
var db = require('./lib/db')(config.database.url)

var PORT = process.env.PORT || 3011

app.use(cors({
  origin: true,
  credentials: true
}))

app.use(bodyParser.json())

app.use(oauth(config, db.updateUserIds))

function send500 (res, err) {
  res.status(500).send({
    result: 'error',
    message: err.message
  })
}

app.get('/', (req, res) => {
  res.send({
    title: brickByBrickPackage.description,
    version: brickByBrickPackage.version
  })
})

const tasksQuery = `
  SELECT DISTINCT ON (task) unnest(tasks) AS task
  FROM collections;`

app.get('/tasks', (req, res) => {
  db.executeQuery(tasksQuery, [], (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }
    res.send(rows.map((row) => row.task))
  })
})

const filterNullValues = (obj) => R.pickBy((val, key) => val !== null, obj)

function sendItem (req, res, row) {
  if (!row) {
    res.status(404).send({
      result: 'error',
      message: 'Not found'
    })
  } else {
    res.send(filterNullValues({
      provider: row.provider,
      id: row.item_id,
      data: row.item_data,
      collection: filterNullValues({
        id: row.collection_id,
        title: row.collection_title,
        url: row.collection_url,
        tasks: row.collection_tasks,
        data: row.collection_data
      })
    }))
  }
}

const allItemsQuery = `
  SELECT
    items.provider,
    items.id AS item_id,
    items.data AS item_data,
    collections.id AS collection_id,
    collections.title AS collection_title,
    collections.url AS collection_url,
    collections.tasks AS collection_tasks,
    collections.data AS collection_data
  FROM items
  JOIN collections ON (collections.id = items.collection_id)`

const randomItemQuery = `
  ${allItemsQuery}
  WHERE (items.provider, items.id) NOT IN (
    SELECT item_provider, item_id
    FROM submissions
    WHERE user_id = $1 AND task = $2
  ) AND $3 @> tasks AND (
    collections.submissions_needed = -1
    OR NOT EXISTS (
      SELECT * FROM submission_counts
      WHERE
        item_provider = items.provider AND
        item_id = items.id AND
        task = $2
    ) OR (
      SELECT count FROM submission_counts
      WHERE
        item_provider = items.provider AND
        item_id = items.id AND
        task = $2
    ) < collections.submissions_needed
  )
  ORDER BY RANDOM() LIMIT 1;`

// TODO: add ?provider=:provider&collection=:collectionId
// TODO: see if ORDER BY RANDOM() LIMIT 1 scales
app.get('/tasks/:task/items/random', (req, res) => {
  db.executeQuery(randomItemQuery, [req.session.user.id, req.params.task, [req.params.task]], (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }
    sendItem(req, res, rows[0])
  })
})

const itemQuery = `
  ${allItemsQuery}
  WHERE items.provider = $1 AND items.id = $2;`

app.get('/items/:provider/:id', (req, res) => {
  db.executeQuery(itemQuery, [req.params.provider, req.params.id], (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }
    sendItem(req, res, rows[0])
  })
})

function itemExists (req, res, next) {
  db.itemExists(req.params.provider, req.params.id, (err, exists) => {
    if (err) {
      send500(res, err)
      return
    }

    if (exists) {
      next()
    } else {
      res.status(404).send({
        result: 'error',
        message: 'Not found'
      })
    }
  })
}

app.post('/items/:provider/:id', itemExists, (req, res) => {
  var row = {
    item_provider: req.params.provider,
    item_id: req.params.id,
    task: null,
    user_id: null,
    step: null,
    step_index: null,
    skipped: null,
    data: null,
    client: null
  }

  // POST data should contain:
  //     - task
  //     - step
  //     - stepIndex
  //   if skipped == true,
  //     data should be undefined

  if (!req.body) {
    res.status(406).send({
      result: 'error',
      message: 'POST data should not be empty'
    })
    return
  }

  var body = req.body

  if (!body.task || !body.task.length) {
    res.status(406).send({
      result: 'error',
      message: 'No task specified'
    })
    return
  }

  row.task = body.task

  const hasData = body.data && R.keys(body.data).length
  if (body.skipped && !hasData) {
    row.skipped = true
  } else if (!body.skipped && hasData) {
    row.data = body.data
    row.skipped = false
  } else {
    res.status(406).send({
      result: 'error',
      message: 'Only completed steps should contain data - and skipped steps should not'
    })
    return
  }

  const DEFAULT_STEP = 'default'
  const DEFAULT_STEP_INDEX = 0

  // Check if step and stepIndex are present in body
  if (body.step && body.stepIndex >= 0) {
    row.step = body.step
    row.step_index = body.stepIndex
  } else {
    row.step = DEFAULT_STEP
    row.step_index = DEFAULT_STEP_INDEX
  }

  // Get user ID
  row.user_id = req.session.user.id

  // Get information about client
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
  var client = {
    ip: ip
  }
  row.client = JSON.stringify(client)

  var columns = R.keys(row)
  var placeholders = columns.map((column, i) => `$${i + 1}`)
  var values = placeholders.join(', ')
  var query = `INSERT INTO submissions (${columns.join(', ')})
      VALUES (${values})
    ON CONFLICT (item_provider, item_id, user_id, task, step)
    WHERE NOT skipped
    DO UPDATE SET
      step_index = EXCLUDED.step_index,
      skipped = EXCLUDED.skipped,
      date_modified = current_timestamp at time zone 'UTC',
      data = EXCLUDED.data,
      client = EXCLUDED.client
    WHERE NOT EXCLUDED.skipped;`

  db.executeQuery(query, R.values(row), (err) => {
    if (err) {
      console.log(err)
      res.status(500).send({
        result: 'error',
        message: err.message
      })
    } else {
      // emitEvent(Object.assign(row, {
      //   data: feature.properties.data,
      //   geometry: feature.geometry
      // }))
      res.send({
        result: 'success'
      })
    }
  })
})

// function emitEvent (row) {
//   var feature = locationToFeature(row)
//   io.emit('feature', feature)
// }

const submissionRowToJson = (row) => ({
  collection: {
    id: row.collection_id
  },
  item: {
    provider: row.item_provider,
    id: row.item_id,
    data: row.item_data
  },
  task: row.task,
  step: row.step,
  skipped: row.skipped ? true : null,
  data: row.data,
  dateCreated: row.date_created,
  dateModified: row.date_modified
})

const collectionRowToJson = (row) => ({
  id: row.id,
  tasks: row.tasks,
  title: row.title,
  url: row.url,
  submissionsNeeded: row.submissions_needed,
  data: row.data
})

app.get('/tasks/:task/submissions', (req, res) => {
  const task = req.params.task
  const userId = req.session.user.id
  var query = db.makeSubmissionsQuery(task, userId)

  db.executeQuery(query, [task, req.session.user.id], (err, rows) => {
    if (err) {
      res.status(500).send({
        result: 'error',
        message: err.message
      })
    } else {
      res.send(rows.map(submissionRowToJson).map(filterNullValues))
    }
  })
})

app.get('/tasks/:task/submissions/all', (req, res) => {
  const task = req.params.task
  var query = db.makeSubmissionsQuery(task, null, 1000)
  db.executeQuery(query, [task], (err, rows) => {
    if (err) {
      res.status(500).send({
        result: 'error',
        message: err.message
      })
    } else {
      res.send(rows.map(submissionRowToJson).map(filterNullValues))
    }
  })
})

app.get('/tasks/:task/submissions/all.ndjson', (req, res) => {
  const task = req.params.task
  var query = db.makeSubmissionsQuery(task)

  var stream = db.streamQuery(query, [task], (err, stream) => {
    if (err) {
      send500(res, err)
      return
    }

    // res.type('application/x-ndjson')
    H(stream)
      .map(submissionRowToJson)
      .map(filterNullValues)
      .map(JSON.stringify)
      .intersperse('\n')
      .pipe(res)
  })
})

app.get('/tasks/:task/submissions/count', (req, res) => {
  const task = req.params.task
  const userId = req.session.user.id
  var query = `
    SELECT COUNT(*)::int AS count
    FROM (
      ${db.makeSubmissionsQuery(task, userId)}
    ) s;`

  db.executeQuery(query, [task, userId], (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }

    var count = (rows[0] && rows[0].count) || 0
    res.send({
      completed: count
    })
  })
})

var collectionsQuery = `
  SELECT *
  FROM collections
  WHERE provider = $1;`

app.get('/providers/:providerId/collections', (req, res) => {
  db.executeQuery(collectionsQuery, [req.params.providerId], (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }

    res.send(rows.map(collectionRowToJson).map(filterNullValues))
  })
})

var collectionQuery = `
  SELECT *
  FROM collections
  WHERE provider = $1 AND id = $2;`

app.get('/providers/:providerId/collections/:collectionId', (req, res) => {
  db.executeQuery(collectionQuery, [req.params.providerId, req.params.colletionId], (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }

    const collection = rows[0]

    if (!collection) {
      res.status(404).send({
        result: 'error',
        message: 'Not found'
      })
      return
    }

    res.send(filterNullValues(collectionRowToJson(collection)))
  })
})

server.listen(PORT, () => {
  console.log(`${brickByBrickPackage.name} API listening on PORT ${PORT}!`)
})
