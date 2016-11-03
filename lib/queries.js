const tasksQuery = `
  SELECT *
  FROM tasks;`

const collectionQuery = `
  SELECT *
  FROM collections
  WHERE organization_id = $1 AND id = $2;`

const collectionsQuery = `
  SELECT
    c.*,
    array_agg(task_id) AS tasks,
    array_agg(submissions_needed) AS submissions_needed
  FROM collections c
  JOIN collections_tasks ct
  ON ct.organization_id = c.organization_id AND ct.collection_id = c.id
  WHERE c.organization_id = $1
  GROUP BY c.organization_id, c.id;`

const allItemsQuery = `
  SELECT
    i.organization_id,
    i.id AS item_id,
    i.data AS item_data,
    c.id AS collection_id,
    c.title AS collection_title,
    c.url AS collection_url,
    c.data AS collection_data
  FROM items i
  JOIN collections c
  ON (c.id = i.collection_id)
  JOIN collections_tasks ct
  ON (ct.organization_id = c.organization_id AND ct.collection_id = c.id)`

const addCollectionsTasksGroupBy = (query) => `
  SELECT r.*,
    array_agg(task_id) AS tasks,
    array_agg(submissions_needed) AS submissions_needed
  FROM (
    ${query}
  ) r
  JOIN collections_tasks ct
  ON (ct.organization_id = r.organization_id AND ct.collection_id = r.collection_id)
  GROUP BY
    r.organization_id, r.item_id, r.item_data,
    r.collection_id, r.collection_title, r.collection_url, r.collection_data;`

const makeRandomItemQuery = (collections) => `
  ${allItemsQuery}
  WHERE
  task_id = $2 AND
  (i.organization_id, i.id) NOT IN (
    SELECT organization_id, item_id
    FROM submissions
    WHERE user_id = $1 AND task_id = $2
  ) AND
    ${collections ? 'collections.id = ANY ($3)' : 'TRUE'} AND (
      ct.submissions_needed IS NOT NULL
      OR NOT EXISTS (
      SELECT * FROM submission_counts sc
      WHERE
        sc.organization_id = i.organization_id AND
        sc.item_id = i.id AND
        sc.task_id = $2
    ) OR (
      SELECT count FROM submission_counts sc
      WHERE
        sc.organization_id = i.organization_id AND
        sc.item_id = i.id AND
        sc.task_id = $2
    ) < ct.submissions_needed
  )
  ORDER BY RANDOM() LIMIT 1`

const itemQuery = `
  ${allItemsQuery}
  WHERE i.organization_id = $1 AND i.id = $2
  LIMIT 1`

const makeInsertSubmissionQuery = (columns, values) => `
  INSERT INTO submissions (${columns.join(', ')})
    VALUES (${values})
  ON CONFLICT (organization_id, item_id, user_id, task_id, step)
    WHERE NOT skipped
    DO UPDATE SET
      step_index = EXCLUDED.step_index,
      skipped = EXCLUDED.skipped,
      date_modified = current_timestamp at time zone 'UTC',
      data = EXCLUDED.data,
      client = EXCLUDED.client
    WHERE NOT EXCLUDED.skipped;`

const makeSubmissionsQuery = (task, userId, limit) => `
  SELECT
    s.*, i.collection_id, i.data AS item_data
  FROM (
    SELECT organization_id, item_id, user_id, MAX(step_index) AS max_step
    FROM submissions
    WHERE NOT skipped AND
      task_id = $1
      ${userId ? 'AND user_id = $2' : ''}
    GROUP BY organization_id, item_id, user_id
  ) AS m
  JOIN submissions s
  ON s.step_index = max_step AND m.organization_id = s.organization_id AND
    m.item_id = s.item_id AND m.user_id = s.user_id
  JOIN items i ON s.organization_id = i.organization_id AND s.item_id = i.id
  ORDER BY date_modified DESC
  ${limit ? `LIMIT ${parseInt(limit) || 1}` : ''}
  -- don't end this query with semicolon,
  -- it's used as a subquery in /submissions/count route`

var makeSubmissionsCountQuery = (task, userId) => `
  SELECT COUNT(*)::int AS count
  FROM (
    ${makeSubmissionsQuery(task, userId)}
  ) s;`

var itemExistsQuery = `
  SELECT organization_id, id
  FROM items
  WHERE organization_id = $1 AND id = $2;`

module.exports = {
  tasksQuery,
  collectionQuery,
  collectionsQuery,
  allItemsQuery,
  addCollectionsTasksGroupBy,
  makeRandomItemQuery,
  itemQuery,
  makeInsertSubmissionQuery,
  makeSubmissionsQuery,
  makeSubmissionsCountQuery,
  itemExistsQuery
}
