var pg = require('pg')

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
      SELECT item_provider, item_id, user_id, MAX(step_index) AS max_step
      FROM submissions
      WHERE NOT skipped ${userId ? 'AND user_id = $1' : ''}
      GROUP BY item_provider, item_id, user_id
    ) AS m
    JOIN submissions s
    ON s.step_index = max_step AND m.item_provider = s.item_provider AND
      m.item_id = s.item_id AND m.user_id = s.user_id
    ORDER BY date_modified DESC
    ${limit ? `LIMIT ${limit}` : ''}
    -- don't end this query with semicolon,
    -- it's used as a subquery in /submissions/count route`

  var itemExistsQuery = `
    SELECT provider, id
    FROM items
    WHERE provider = $1 AND id = $2;`

  function itemExists (provider, id, callback) {
    executeQuery(itemExistsQuery, [provider, id], (err, rows) => {
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
      WHERE _S.item_provider = S.item_provider
      AND _S.item_id = S.item_id
      AND _S.step = S.step
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
    updateUserIds,
    makeSubmissionsQuery,
    itemExists
  }
}
