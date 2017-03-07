const tasksQuery = `
  SELECT *
  FROM tasks;`

const organizationsQuery = `
  SELECT *
  FROM organizations;`

const authorizedOrganizationQuery = `
  SELECT *
  FROM organizations
  WHERE
    id = $1 AND (
      user_email_filter_regex IS NULL OR
      $2 ~* user_email_filter_regex
    );`

const authorizedOrganizationsQuery = `
  SELECT *
  FROM organizations
  WHERE
    user_email_filter_regex IS NULL OR
    $1 ~* user_email_filter_regex;`

const collectionsQuery = `
  SELECT
    c.*,
    array_agg(task_id) AS tasks,
    array_agg(submissions_needed) AS submissions_needed
  FROM collections c
  JOIN collections_tasks ct
  ON ct.organization_id = c.organization_id AND ct.collection_id = c.id
  GROUP BY c.organization_id, c.id`

const makeAuthorizedCollectionsQuery = (organizationIds, collectionIds) => `
  SELECT
    c.*,
    array_agg(task_id) AS tasks,
    array_agg(submissions_needed) AS submissions_needed
  FROM collections c
  JOIN collections_tasks ct
  ON ct.organization_id = c.organization_id AND ct.collection_id = c.id
  JOIN organizations o
  ON o.id = ct.organization_id
  WHERE
    ${organizationIds ? `o.id = ANY($2)` : 'TRUE'} AND
    ${collectionIds ? `c.id = ANY(${organizationIds ? '$3' : '$2'})` : 'TRUE'} AND
    (o.user_email_filter_regex IS NULL OR
    $1 ~* o.user_email_filter_regex)
  GROUP BY c.organization_id, c.id`

const authorizedCollectionsQuery = makeAuthorizedCollectionsQuery()

const makeCollectionsWithTaskQuery = (query, params) => `
  SELECT * FROM (
    ${query}
  ) c
  WHERE ARRAY[$${params.length}] <@ tasks`

const organizationCollectionQuery = `
  SELECT
    c.*,
    array_agg(task_id) AS tasks,
    array_agg(submissions_needed) AS submissions_needed
  FROM collections c
  JOIN collections_tasks ct
  ON ct.organization_id = c.organization_id AND ct.collection_id = c.id
  WHERE c.organization_id = $1 AND c.id = $2
  GROUP BY c.organization_id, c.id`

const organizationCollectionsQuery = `
  SELECT
    c.*,
    array_agg(task_id) AS tasks,
    array_agg(submissions_needed) AS submissions_needed
  FROM collections c
  JOIN collections_tasks ct
  ON ct.organization_id = c.organization_id AND ct.collection_id = c.id
  WHERE c.organization_id = $1
  GROUP BY c.organization_id, c.id`

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

const makeAllItemsForTaskQuery = (paramIndexes) => `
  ${allItemsQuery}
  JOIN organizations o
  ON o.id = ct.organization_id
  WHERE
  task_id = $${paramIndexes.taskId} AND (
    o.user_email_filter_regex IS NULL OR
    ${paramIndexes.email ? `$${paramIndexes.email}` : `''`} ~* o.user_email_filter_regex
  ) AND
  ${paramIndexes.organizations ? `c.organization_id = ANY ($${paramIndexes.organizations})` : 'TRUE'} AND
  ${paramIndexes.collections ? `c.id = ANY ($${paramIndexes.collections})` : 'TRUE'}`

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
    r.collection_id, r.collection_title, r.collection_url, r.collection_data`

const makeRandomItemQuery = (paramIndexes) => {
  return `${allItemsQuery}
  JOIN organizations o
  ON o.id = ct.organization_id
  WHERE
  task_id = $2 AND (
    o.user_email_filter_regex IS NULL OR
    ${paramIndexes.email ? `$${paramIndexes.email}` : `''`} ~* o.user_email_filter_regex
  ) AND
  (i.organization_id, i.id) NOT IN (
    SELECT organization_id, item_id
    FROM submissions
    WHERE user_id = $1 AND task_id = $2
  ) AND
    ${paramIndexes.organizations ? `c.organization_id = ANY ($${paramIndexes.organizations})` : 'TRUE'} AND
    ${paramIndexes.collections ? `c.id = ANY ($${paramIndexes.collections})` : 'TRUE'} AND (
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
}

const addSubmissionForUser = (query, paramIndexes) => `
  SELECT
    i.*,
    s.data AS submission_data,
    s.skipped AS submission_skipped,
    s.date_created AS submission_date_created,
    s.date_modified AS submission_date_modified
  FROM (
    ${query}
  ) i
  LEFT OUTER JOIN submissions s ON
    i.organization_id = s.organization_id AND
    i.item_id = s.item_id AND
    s.user_id = $${paramIndexes.userId}`

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



const completedSubmissionsQuery = (userId) => `
  SELECT organization_id, item_id, user_id, MAX(step_index) AS max_step
  FROM submissions
  WHERE NOT skipped AND
    task_id = $1
    ${userId ? 'AND user_id = $2' : ''}
  GROUP BY organization_id, item_id, user_id
  -- don't end this query with semicolon,
  -- it's used as a subquery in /submissions/count route`


const makeSubmissionsQuery = (userId, limit) => `
  SELECT
    grouped.*, i.collection_id, i.data AS item_data
  FROM (
    SELECT
      completed.organization_id,
      completed.item_id,
      task_id,
      jsonb_agg(
        json_build_object(
          'step', step,
          'stepIndex', step_index,
          'data', data,
          'userId', completed.user_id,
          'dateCreated', date_created,
          'dateModified', date_modified
        )
      ) AS submissions
    FROM (
        ${completedSubmissionsQuery(userId)}
      ) AS completed
    JOIN submissions s
    ON
      s.step_index = max_step AND
      completed.organization_id = s.organization_id AND
      completed.item_id = s.item_id AND
      completed.user_id = s.user_id
    GROUP BY
      completed.organization_id, completed.item_id, task_id
  ) grouped
  JOIN items i
  ON
    grouped.organization_id = i.organization_id AND
    grouped.item_id = i.id
  ${limit ? `LIMIT ${parseInt(limit) || 1}` : ''};`

var makeSubmissionsCountQuery = (userId) => `
  SELECT COUNT(*)::int AS count
  FROM (
    ${completedSubmissionsQuery(userId)}
  ) s;`

var itemExistsQuery = `
  SELECT organization_id, id
  FROM items
  WHERE organization_id = $1 AND id = $2;`

const deleteOldSubmissionsUserIdsQuery = `
  DELETE
  FROM submissions s1
  WHERE s1.user_id IN ($1::integer, $2::integer)
  AND user_id = (
    SELECT user_id
    FROM submissions s2
    WHERE s2.organization_id = s1.organization_id
    AND s2.item_id = s1.item_id
    AND s2.step = s1.step
    AND s2.user_id IN ($1::integer, $2::integer)
    ORDER BY s2.skipped ASC, s2.date_modified DESC
    OFFSET 1
  );`

const updateSubmissionsUserIdsQuery = `
  UPDATE submissions SET user_id = $2
  WHERE user_id = ANY($1);`

const addLimitAndOffset = (query, paramIndexes) => `
  ${query}
  LIMIT $${paramIndexes.limit}`

module.exports = {
  organizationsQuery,
  authorizedOrganizationQuery,
  authorizedOrganizationsQuery,
  tasksQuery,
  collectionsQuery,
  makeAuthorizedCollectionsQuery,
  authorizedCollectionsQuery,
  makeCollectionsWithTaskQuery,
  organizationCollectionQuery,
  organizationCollectionsQuery,
  allItemsQuery,
  addCollectionsTasksGroupBy,
  addSubmissionForUser,
  makeAllItemsForTaskQuery,
  makeRandomItemQuery,
  itemQuery,
  makeInsertSubmissionQuery,
  makeSubmissionsQuery,
  makeSubmissionsCountQuery,
  itemExistsQuery,
  deleteOldSubmissionsUserIdsQuery,
  updateSubmissionsUserIdsQuery,
  addLimitAndOffset
}
