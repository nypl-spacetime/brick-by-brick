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

function getUserEmail (req) {
  return 'bertspaan@nypl.org'
  return req && req.session && req.session.oauth &&
    req.session.oauth.data && req.session.oauth.data.email || ''
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

app.get('/organizations', (req, res) => {
  db.executeQuery(queries.organizationsQuery, [], (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }
    res.send(serialize.organizations(rows))
  })
})

app.get('/organizations/authorized', (req, res) => {
  const email = getUserEmail(req)
  db.executeQuery(queries.authorizedOrganizationsQuery, [email], (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }
    res.send(serialize.organizations(rows))
  })
})

app.get('/collections', (req, res) => {
  db.executeQuery(queries.collectionsQuery, [], (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }

    res.send(serialize.collections(rows))
  })
})

app.get('/collections/authorized', (req, res) => {
  const email = getUserEmail(req)
  db.executeQuery(queries.authorizedCollectionsQuery, [email], (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }

    res.send(serialize.collections(rows))
  })
})

app.get('/tasks', (req, res) => {
  db.executeQuery(queries.tasksQuery, [], (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }
    res.send(serialize.tasks(rows))
  })
})

app.get('/tasks/:taskId/collections', (req, res) => {
  const params = [req.params.taskId]
  const query = queries.makeCollectionsWithTaskQuery(queries.collectionsQuery, params)
  db.executeQuery(query, params, (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }
    res.send(serialize.collections(rows))
  })
})

app.get('/tasks/:taskId/collections/authorized', (req, res) => {
  const email = getUserEmail(req)
  const params = [email, req.params.taskId]
  const query = queries.makeCollectionsWithTaskQuery(queries.authorizedCollectionsQuery, params)
  db.executeQuery(query, params, (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }
    res.send(serialize.collections(rows))
  })
})

// TODO: see if ORDER BY RANDOM() LIMIT 1 scales
app.get('/tasks/:taskId/items/random', userAuthorizedForOrganizationsOrCollections, (req, res) => {
  var params = [req.session.user.id, req.params.taskId]

  var organizations
  if (req.query && req.query.organization) {
    organizations = req.query.organization.split(',')
    params.push(organizations)
  }

  var collections
  if (req.query && req.query.collection) {
    collections = req.query.collection.split(',')
    params.push(collections)
  }

  const email = getUserEmail(req)
  if (email) {
    params.push(email)
  }

  var query = queries.makeRandomItemQuery(organizations, collections, email)
  query = queries.addCollectionsTasksGroupBy(query)

  db.executeQuery(query, params, (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }
    sendItem(req, res, rows[0])
  })
})

app.get('/organizations/:organizationId/items/:itemId', userAuthorizedForOrganizationsOrCollections, (req, res) => {
  const query = queries.addCollectionsTasksGroupBy(queries.itemQuery)

  db.executeQuery(query, [req.params.organizationId, req.params.itemId], (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }
    sendItem(req, res, rows[0])
  })
})

function userAuthorizedForOrganizationsOrCollections (req, res, next) {
  var organizationIds
  const organizationId = req.params.organizationId ||
    (req.body && req.body.organization && req.body.organization.id)
  if (organizationId) {
    organizationIds = [organizationId]
  } else if (req.query && req.query.organization) {
    organizationIds = req.query.organization.split(',')
  }

  var collectionIds
  const collectionId = req.params.collectionId ||
    (req.body && req.body.collection && req.body.collection.id)
  if (collectionId) {
    collectionIds = [collectionId]
  } else if (req.query && req.query.collection) {
    collectionIds = req.query.collection.split(',')
  }

  if (!organizationIds && !collectionIds) {
    next()
    return
  }

  const email = getUserEmail(req)
  const query = queries.makeAuthorizedCollectionsQuery(email, organizationIds, collectionIds)
  const params = [email, organizationIds, collectionIds]
    .filter((param) => param !== undefined)

  db.executeQuery(query, params, (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }

    if (rows.length === 0) {
      res.status(401).send({
        result: 'error',
        message: 'Unauthorized'
      })
    } else {
      next()
    }
  })
}

function itemExists (req, res, next) {
  const itemId = req.params.itemId ||
    (req.body && req.body.item && req.body.item.id)

  const organizationId = req.params.organizationId ||
    (req.body && req.body.organization && req.body.organization.id)

  db.itemExists(organizationId, itemId, (err, exists) => {
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

app.post('/submissions', userAuthorizedForOrganizationsOrCollections, itemExists, (req, res) => {
  var row = {
    organization_id: null,
    item_id: null,
    task_id: null,
    user_id: null,
    step: null,
    step_index: null,
    skipped: null,
    data: null,
    client: null
  }

  // POST data should contain:
  //     - item.id - string
  //     - organization.id - string
  //     - task.id - string
  //     - step - string (optional)
  //     - stepIndex (optional)
  //     - data - object
  //     - skipped - boolean
  //   if skipped == true,
  //     data should be undefined

  if (!req.body) {
    res.status(406).send({
      result: 'error',
      message: 'POST data should not be empty'
    })
    return
  }

  const body = req.body

  const itemId = body.item && body.item.id
  if (!itemId) {
    res.status(406).send({
      result: 'error',
      message: 'item.id not specified'
    })
    return
  }
  row.item_id = itemId

  const organizationId = body.organization && body.organization.id
  if (!organizationId) {
    res.status(406).send({
      result: 'error',
      message: 'organization.id not specified'
    })
    return
  }
  row.organization_id = organizationId

  const taskId = body.task && body.task.id
  if (!taskId) {
    res.status(406).send({
      result: 'error',
      message: 'No taskId specified'
    })
    return
  }
  row.task_id = taskId

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

app.get('/organizations/:organizationId/collections', (req, res) => {
  db.executeQuery(queries.organizationCollectionsQuery, [req.params.organizationId], (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }

    res.send(serialize.collections(rows))
  })
})

app.get('/organizations/:organizationId/collections/:collectionId', (req, res) => {
  const params = [req.params.organizationId, req.params.colletionId]
  db.executeQuery(queries.organizationCollectionQuery, params, (err, rows) => {
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
