/* global describe it beforeEach */

var assert = require('chai').assert

if (!process.env.WHERE_API_CONFIG) throw new Error('oh no you need env vars')

var config = require(process.env.WHERE_API_CONFIG)
var db = require('../lib/db')(config)

describe('OAuth', function () {
  var submissionsForUser = function (id, cb) {
    db.executeQuery('SELECT * FROM submissions WHERE user_id=$1 ORDER BY date_modified ASC', [id], function (err, rows) {
      if (err) throw (err)
      else cb(rows)
    })
  }

  beforeEach(function (done) {
    var rows = [
      {
        uuid: 'uuid',
        user_id: 1,
        step: 'first step',
        data: '{"data": "original data"}',
        step_index: 0,
        skipped: false,
        date_modified: '2016-06-14 01:00:00'
      },
      {
        uuid: 'uuid',
        user_id: 1,
        step: 'second step',
        data: '{"data": "original data step 2"}',
        step_index: 0,
        skipped: false,
        date_modified: '2016-06-14 01:00:00'
      },
      {
        uuid: 'uuid',
        user_id: 2,
        step: 'first step',
        step_index: 0,
        skipped: false,
        date_modified: '2016-06-15 01:00:00'
      },
      {
        uuid: 'uuid',
        user_id: 2,
        step: 'second step',
        step_index: 0,
        skipped: false,
        date_modified: '2016-06-15 01:00:00'
      },
      {
        uuid: 'uuid',
        user_id: 3,
        step: 'first step',
        data: '{"data": "newer data"}',
        step_index: 0,
        skipped: false,
        date_modified: '2016-06-16 01:00:00'
      },
      {
        uuid: 'uuid',
        user_id: 3,
        step: 'second step',
        step_index: 0,
        skipped: true,
        date_modified: '2016-06-16 01:00:00'
      }
    ]
    db.fillTable('submissions', rows, done)
  })

  describe('#db.updateUserIds', function () {
    it('Should remove older submissions for previous user', function (done) {
      db.updateUserIds([3], 1, function (err) {
        if (err) throw err
        assert.equal(null, err)

        submissionsForUser(3, function (submissions) {
          assert.equal(0, submissions.length)
          done()
        })
      })
    })

    it('Newest submission should be active unless skipped', function (done) {
      db.updateUserIds([3], 1, function (err) {
        if (err) throw err
        assert.equal(null, err)

        submissionsForUser(1, function (submissions) {
          assert.equal(2, submissions.length)

          assert.equal(submissions[0].data.data, 'original data step 2')
          assert.equal(submissions[1].data.data, 'newer data')

          done()
        })
      })
    })
  })
})
