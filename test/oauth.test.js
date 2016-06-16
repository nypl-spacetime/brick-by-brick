/* global describe it beforeEach */

var assert = require('chai').assert

var db = require('./test-db').db

describe('OAuth', function () {
  var submissionsForUser = function (id, cb) {
    db.executeQuery('SELECT * FROM submissions WHERE user_id=$1 ORDER BY date_modified ASC', [id], function (err, rows) {
      if (err) throw (err)
      else cb(rows)
    })
  }

  beforeEach(function (done) {
    var rows = [
      // User1 completes two steps:
      {
        uuid: 'uuid',
        user_id: 1,
        step: 'first step',
        data: '{"data": "original data step 1"}',
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
      // User2 completes two steps:
      {
        uuid: 'uuid',
        user_id: 2,
        step: 'first step',
        step_index: 0,
        skipped: true,
        date_modified: '2016-06-15 01:00:00'
      },
      {
        uuid: 'uuid',
        user_id: 2,
        step: 'second step',
        data: '{"data": "newer data step 2"}',
        step_index: 0,
        skipped: false,
        date_modified: '2016-06-15 01:00:00'
      },
      // User3 completes 1 step, skips second step:
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
      // User1 logs in after submitting as User3:
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
      // User1 logs in after submitting as User3:
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

    it('Should effect no other submissions', function (done) {
      // User1 logs in after submitting as User3:
      db.updateUserIds([3], 1, function (err) {
        if (err) throw err
        assert.equal(null, err)

        submissionsForUser(2, function (submissions) {
          assert.equal(2, submissions.length)
          done()
        })
      })
    })

    it('Newest submission should be active unless skipped - round 2', function (done) {
      // User2 logs in, should delete older anon User1 submissions:
      db.updateUserIds([1], 2, function (err) {
        if (err) throw err
        assert.equal(null, err)

        submissionsForUser(2, function (submissions) {
          assert.equal(2, submissions.length)

          assert.equal(submissions[0].data.data, 'original data step 1')
          assert.equal(submissions[1].data.data, 'newer data step 2')

          done()
        })
      })
    })
  })
})
