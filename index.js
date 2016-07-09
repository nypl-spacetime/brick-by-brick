'use strict'

var argv = require('minimist')(process.argv.slice(2))
var R = require('ramda')
var express = require('express')
var cors = require('cors')
var request = require('request')
var bodyParser = require('body-parser')
var geojsonhint = require('geojsonhint')
var turf = {
  centroid: require('turf-centroid')
}
var surveyorPackage = require('./package')
var app = express()
var server = require('http').createServer(app)
var io = require('socket.io')(server)

var config = require('./base-config.json')
var userConfig = Object.assign({}, config)
if (process.env.SURVEYOR_API_CONFIG || argv.config) {
  userConfig = require(process.env.SURVEYOR_API_CONFIG || argv.config)
}

const envVar = (key1, key2) => `${key1.toUpperCase()}_${key2.toUpperCase()}`

Object.keys(config).forEach((key1) => {
  Object.keys(config[key1]).forEach((key2) => {
    config[key1][key2] = process.env[envVar(key1, key2)] || userConfig[key1][key2] || config[key1][key2]
  })
})

var oauth = require('express-pg-oauth')
var db = require('./lib/db')(config.database.url)
var initializeData = require('./lib/initialize-data')

var PORT = process.env.PORT || 3011

app.use(cors({
  origin: true,
  credentials: true
}))

app.use(bodyParser.json())

app.use(oauth(config, db.updateUserIds))

initializeData(db)

function send500 (res, err) {
  res.status(500).send({
    result: 'error',
    message: err.message
  })
}

app.get('/', (req, res) => {
  res.send({
    title: surveyorPackage.description,
    version: surveyorPackage.version
  })
})

function emitEvent (row) {
  var feature = locationToFeature(row)
  io.emit('feature', feature)
}

function locationToFeature (row) {
  return {
    type: 'Feature',
    properties: {
      uuid: row.uuid,
      imageId: row.image_id,
      step: row.step,
      completed: row.completed,
      date: row.date_modified,
      url: 'http://digitalcollections.nypl.org/items/' + row.uuid,
      data: row.data
    },
    geometry: row.geometry
  }
}

function locationsToGeoJson (rows) {
  return {
    type: 'FeatureCollection',
    features: rows.map(locationToFeature)
  }
}

function sendItem (req, res, item) {
  if (!item) {
    res.status(404).send({
      result: 'error',
      message: 'Not found'
    })
  } else {
    res.send(item)
  }
}

// TODO: find out if ORDER BY RANDOM() scales!
const randomItemQuery = `
  SELECT *
  FROM items
  WHERE uuid NOT IN (
    SELECT uuid
    FROM submissions
    WHERE user_id = $1
  )
  ORDER BY RANDOM() limit 1;`

app.get('/items/random', (req, res) => {
  db.executeQuery(randomItemQuery, [req.session.user.id], (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }
    sendItem(req, res, rows[0])
  })
})

const itemQuery = `
  SELECT *
  FROM items
  WHERE uuid = $1`

app.get('/items/:uuid', (req, res) => {
  db.executeQuery(itemQuery, [req.params.uuid], (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }
    sendItem(req, res, rows[0])
  })
})

app.get('/items/:uuid/mods', (req, res) => {
  var uuid = req.params.uuid

  if (!config.digital_collections.token) {
    res.status(401).send({
      result: 'error',
      message: 'Not authorized'
    })
  } else {
    var url = `http://api.repo.nypl.org/api/v1/items/mods_captures/${uuid}`
    request({
      url: url,
      json: true,
      headers: {
        Authorization: `Token token="${config.digital_collections.token}"`
      }
    }, function (error, response, body) {
      if (error) {
        res.status(500).send({
          result: 'error',
          message: error
        })
      } else {
        if (body && body.nyplAPI && body.nyplAPI.response && body.nyplAPI.response.mods) {
          res.send(body.nyplAPI.response.mods)
        } else {
          res.status(406).send({
            result: 'error',
            message: 'Cannot parse MODS result'
          })
        }
      }
    })
  }
})

function itemExists (req, res, next) {
  db.itemExists(req.params.uuid, (err, exists) => {
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

app.post('/items/:uuid', itemExists, (req, res) => {
  var row = {
    uuid: req.params.uuid,
    user_id: null,
    step: null,
    step_index: null,
    skipped: null,
    data: null,
    client: null,
    geometry: null,
    centroid: null
  }

  // POST data should be GeoJSON feature (with optional geometry)
  //   properties should contain:
  //     - step
  //     - stepIndex
  //     - skipped
  //   if properties.skipped == false,
  //     properties.data should contain step data
  var feature = req.body

  if (!feature || !feature.properties || feature.type !== 'Feature') {
    res.status(406).send({
      result: 'error',
      message: 'POST data should be GeoJSON Feature'
    })
    return
  }

  // Check if step and stepIndex are present in properties
  if (!(feature.properties.step && feature.properties.stepIndex >= 0)) {
    res.status(406).send({
      result: 'error',
      message: 'Feature should contain step and stepIndex'
    })
    return
  }
  row.step = feature.properties.step
  row.step_index = feature.properties.stepIndex

  if (!feature.properties.skipped) {
    if (!feature.properties.data) {
      res.status(406).send({
        result: 'error',
        message: 'Completed steps should contain data'
      })
      return
    }
    row.skipped = false
    row.data = JSON.stringify(feature.properties.data)
  } else {
    if (feature.properties.data || feature.properties.data) {
      res.status(406).send({
        result: 'error',
        message: 'Only completed steps should contain data or geometry'
      })
      return
    }

    row.skipped = true
  }

  if (feature.geometry) {
    var geojsonErrors = geojsonhint.hint(feature).map((err) => err.message)
    if (geojsonErrors.length > 0) {
      res.status(406).send({
        result: 'error',
        message: geojsonErrors.length === 1 ? geojsonErrors[0] : geojsonErrors
      })
      return
    }
    row.geometry = JSON.stringify(feature.geometry)

    // Compute centroid of geometry
    var centroid = turf.centroid(feature.geometry)
    if (centroid) {
      row.centroid = centroid.geometry.coordinates.join(',')
    }
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
  var query = `INSERT INTO submissions (image_id, ${columns.join(', ')})
      SELECT image_id, ${values}
      FROM items
      WHERE uuid = $1
    ON CONFLICT (uuid, user_id, step)
    WHERE NOT skipped
    DO UPDATE SET
      step_index = EXCLUDED.step_index,
      skipped = EXCLUDED.skipped,
      date_modified = current_timestamp at time zone 'UTC',
      data = EXCLUDED.data,
      client = EXCLUDED.client,
      geometry = EXCLUDED.geometry,
      centroid = EXCLUDED.centroid
    WHERE NOT EXCLUDED.skipped;`

  db.executeQuery(query, R.values(row), (err) => {
    if (err) {
      res.status(500).send({
        result: 'error',
        message: err.message
      })
    } else {
      emitEvent(Object.assign(row, {
        data: feature.properties.data,
        geometry: feature.geometry
      }))
      res.send({
        result: 'success'
      })
    }
  })
})

app.get('/submissions', (req, res) => {
  var query = db.makeSubmissionsQuery(req.session.user.id)

  db.executeQuery(query, [req.session.user.id], (err, rows) => {
    if (err) {
      res.status(500).send({
        result: 'error',
        message: err.message
      })
    } else {
      res.send(locationsToGeoJson(rows))
    }
  })
})

app.get('/submissions/all', (req, res) => {
  var query = db.makeSubmissionsQuery(null, 1000)
  db.executeQuery(query, null, (err, rows) => {
    if (err) {
      res.status(500).send({
        result: 'error',
        message: err.message
      })
    } else {
      res.send(locationsToGeoJson(rows))
    }
  })
})

app.get('/submissions/count', (req, res) => {
  var query = `
    SELECT COUNT(*)::int AS count
    FROM (
      ${db.makeSubmissionsQuery(req.session.user.id)}
    ) s;`

  db.executeQuery(query, [req.session.user.id], (err, rows) => {
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
  FROM collections;`

app.get('/collections', function (req, res) {
  db.executeQuery(collectionsQuery, null, (err, rows) => {
    if (err) {
      send500(res, err)
      return
    }

    res.send(rows)
  })
})

server.listen(PORT, () => {
  console.log(`${surveyorPackage.name} API listening on PORT ${PORT}!`)
})
