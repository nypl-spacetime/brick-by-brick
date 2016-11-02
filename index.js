'use strict'

const argv = require('minimist')(process.argv.slice(2))
const H = require('highland')
const R = require('ramda')
const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const pkg = require('./package')
const app = express()
const server = require('http').createServer(app)
// const io = require('socket.io')(server)

const config = require('./base-config.json')
var userConfig = Object.assign({}, config)

var configFound = false
if (process.env.BRICK_BY_BRICK_API_CONFIG || argv.config) {
  userConfig = require(process.env.BRICK_BY_BRICK_API_CONFIG || argv.config)
  configFound = true
}

const envVar = (key1, key2) => `${key1.toUpperCase()}_${key2.toUpperCase()}`

Object.keys(config).forEach((key1) => {
  Object.keys(config[key1]).forEach((key2) => {
    config[key1][key2] = process.env[envVar(key1, key2)] ||
      userConfig[key1][key2] ||
      config[key1][key2]

    if (process.env[envVar(key1, key2)]) {
      configFound = true
    }
  })
})

if (!configFound) {
  const message = 'No config found, set BRICK_BY_BRICK_API_CONFIG, use --config,' +
    ' or set per-item environment variables'

  console.error(message)
  process.exit(1)
}

const oauth = require('express-pg-oauth')
const db = require('./lib/db')(config.database.url)
const queries = require('./lib/queries')
const serialize = require('./lib/serialize')

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
    title: pkg.description,
    version: pkg.version
  })
})

function sendItem (req, res, row) {
  if (!row) {
    res.status(404).send({
      result: 'error',
      message: 'Not found'
    })
  } else {
    res.send(serialize.item(row))
  }
}

app.get('/tasks', (req, res) => {
  db.executeQuery(queries.tasksQuery, [], (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }
    res.send(serialize.tasks(rows))
  })
})

// TODO: add ?provider=:provider
// TODO: see if ORDER BY RANDOM() LIMIT 1 scales
app.get('/tasks/:task/items/random', (req, res) => {
  var collections
  if (req.query && req.query.collection) {
    collections = req.query.collection.split(',')
  }

  var values = [req.session.user.id, req.params.task]
  if (collections) {
    values.push(collections)
  }

  var query = queries.addCollectionsTasksGroupBy(queries.makeRandomItemQuery(collections))

  db.executeQuery(query, values, (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }
    sendItem(req, res, rows[0])
  })
})

app.get('/items/:provider/:id', (req, res) => {
  const query = queries.addCollectionsTasksGroupBy(queries.itemQuery)

  db.executeQuery(query, [req.params.provider, req.params.id], (err, rows) => {
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
    task_id: null,
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

  row.task_id = body.task

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

  const columns = R.keys(row)
  const placeholders = columns.map((column, i) => `$${i + 1}`)
  const values = placeholders.join(', ')

  const query = queries.makeInsertSubmissionQuery(columns, values)

  db.executeQuery(query, R.values(row), (err) => {
    if (err) {
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

// const collectionRowToJson = (row) => ({
//   provider: row.provider,
//   id: row.id,
//   title: row.title,
//   url: row.url,
//   data: row.data,
//   tasks: collectionTaskArraysToJson(row.tasks, row.submissions_needed)
// })

app.get('/tasks/:task/submissions', (req, res) => {
  const task = req.params.task
  const userId = req.session.user.id
  var query = queries.makeSubmissionsQuery(task, userId)

  db.executeQuery(query, [task, req.session.user.id], (err, rows) => {
    if (err) {
      res.status(500).send({
        result: 'error',
        message: err.message
      })
    } else {
      res.send(serialize.submissions(rows))
    }
  })
})

app.get('/tasks/:task/submissions/all', (req, res) => {
  const task = req.params.task
  var query = queries.makeSubmissionsQuery(task, null, 1000)
  db.executeQuery(query, [task], (err, rows) => {
    if (err) {
      res.status(500).send({
        result: 'error',
        message: err.message
      })
    } else {
      res.send(serialize.submissions(rows))
    }
  })
})

app.get('/tasks/:task/submissions/all.ndjson', (req, res) => {
  const task = req.params.task
  var query = queries.makeSubmissionsQuery(task)

  db.streamQuery(query, [task], (err, stream) => {
    if (err) {
      send500(res, err)
      return
    }

    // res.type('application/x-ndjson')
    H(stream)
      .map(serialize.submission)
      .map(JSON.stringify)
      .intersperse('\n')
      .pipe(res)
  })
})

app.get('/tasks/:task/submissions/count', (req, res) => {
  const task = req.params.task
  const userId = req.session.user.id
  const query = queries.makeSubmissionsCountQuery(task, userId)

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

app.get('/providers/:providerId/collections', (req, res) => {
  db.executeQuery(queries.collectionsQuery, [req.params.providerId], (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }

    res.send(serialize.collections(rows))
  })
})

app.get('/providers/:providerId/collections/:collectionId', (req, res) => {
  const params = [req.params.providerId, req.params.colletionId]
  db.executeQuery(queries.collectionQuery, params, (err, rows) => {
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

    res.send(serialize.collection(collection))
  })
})

server.listen(PORT, () => {
  console.log(`${pkg.name} API listening on PORT ${PORT}!`)
})
