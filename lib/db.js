const pg = require('pg')
const QueryStream = require('pg-query-stream')
const queries = require('./queries')

module.exports = function (databaseUrl) {
  function executeQuery (query, params, callback) {
    pg.connect(databaseUrl, (err, client, done) => {
      var handleError = (err) => {
        if (!err) {
          return false
        }

        if (client) {
          done(client)
        }

        console.error(err)

        callback(err)
        return true
      }

      if (handleError(err)) {
        return
      }

      client.query(query, params, (err, results) => {
        if (handleError(err)) {
          return
        }
        done()
        callback(null, results.rows)
      })
    })
  }

  function streamQuery (query, params, callback) {
    pg.connect(databaseUrl, (err, client, done) => {
      if (err) {
        if (client) {
          done(client)
        }

        callback(err)
        return
      }

      var queryStream = new QueryStream(query, params)
      var stream = client.query(queryStream)

      stream.on('end', done)
      callback(null, stream)
    })
  }

  function itemExists (organizationId, id, callback) {
    executeQuery(queries.itemExistsQuery, [organizationId, id], (err, rows) => {
      if (err) {
        callback(err)
      } else {
        callback(null, rows.length === 1)
      }
    })
  }

  function updateUserIds (oldUserIds, newUserId, callback) {
    const deleteParams = [oldUserIds[0], newUserId]
    executeQuery(queries.deleteOldSubmissionsUserIdsQuery, deleteParams, (err, rows) => {
      if (err) callback(err)
      else {
        const updateParams = [oldUserIds, newUserId]
        executeQuery(queries.updateSubmissionsUserIdsQuery, updateParams, (err, rows) => {
          callback(err)
        })
      }
    })
  }

  return {
    executeQuery,
    streamQuery,
    updateUserIds,
    itemExists
  }
}
