var H = require('highland')
var R = require('ramda')
var pg = require('pg')

module.exports = function (config) {
  // https://devcenter.heroku.com/articles/getting-started-with-nodejs#provision-a-database
  var pgConString = process.env.DATABASE_URL || config.server.pgConString
  function executeQuery (query, params, callback) {
    pg.connect(pgConString, (err, client, done) => {
      var handleError = (err) => {
        if (!err) {
          return false
        }

        if (client) {
          done(client)
        }

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

  const makeSubmissionsQuery = (userId, limit) => `
    SELECT * FROM (
      SELECT uuid, user_id, MAX(step_index) AS max_step
      FROM submissions
      WHERE NOT skipped ${userId ? 'AND user_id = $1' : ''}
      GROUP BY uuid, user_id
    ) AS m
    JOIN submissions s
    ON s.step_index = max_step AND m.uuid = s.uuid AND m.user_id = s.user_id
    ORDER BY date_modified DESC
    ${limit ? `LIMIT ${limit}` : ''}
    -- don't end this query with semicolon,
    -- it's used as a subquery in /submissions/count route`

  function executeInsertQuery (table, row, callback) {
    var query = `
      INSERT INTO ${table} (${R.keys(row).join(', ')})
      VALUES (${R.keys(row).map((key, i) => `$${i + 1}`).join(', ')});
    `
    executeQuery(query, R.values(row), callback)
  }

  function fillTable (table, rows, callback) {
    const query = `
      TRUNCATE ${table} CASCADE;`

    executeQuery(query, null, (err) => {
      if (err) {
        callback(err)
      } else {
        H(rows)
          .map(H.curry(executeInsertQuery, table))
          .nfcall([])
          .series()
          .errors((err, push) => {
            if (err.code === '23505') {
              push(null, {})
            } else {
              push(err)
            }
          })
          .done(callback)
      }
    })
  }

  var itemExistsQuery = `
    SELECT uuid
    FROM items
    WHERE uuid = $1;`

  function itemExists (uuid, callback) {
    executeQuery(itemExistsQuery, [uuid], (err, rows) => {
      if (err) {
        callback(err)
      } else {
        callback(null, rows.length === 1)
      }
    })
  }

  var deleteOldSubmissionsUserIdsQuery = `
    DELETE
    FROM submissions S
    WHERE S.user_id IN ($1::integer, $2::integer)
    AND user_id = (
      SELECT user_id
      FROM submissions _S
      WHERE _S.uuid=S.uuid
      AND _S.step=S.step
      AND _S.user_id IN ($1::integer, $2::integer)
      ORDER BY _S.skipped ASC, _S.date_modified DESC
      OFFSET 1
    );`

  var updateSubmissionsUserIdsQuery = `
    UPDATE submissions SET user_id = $2
    WHERE user_id = ANY($1);`

  function updateUserIds (oldUserIds, newUserId, callback) {
    var params = [oldUserIds[0], newUserId]
    executeQuery(deleteOldSubmissionsUserIdsQuery, params, (err, rows) => {
      if (err) callback(err)
      else {
        executeQuery(updateSubmissionsUserIdsQuery, [oldUserIds, newUserId], (err, rows) => {
          callback(err)
        })
      }
    })
  }

  return {
    executeQuery,
    fillTable,
    updateUserIds,
    makeSubmissionsQuery,
    itemExists
  }
}
