CREATE TABLE collections (
  organization_id text NOT NULL,
  id text NOT NULL,
  title text,
  url text,
  data jsonb,
  CONSTRAINT collections_pkey PRIMARY KEY (organization_id, id)
);

CREATE TABLE tasks (
  id text NOT NULL,
  description text,
  CONSTRAINT tasks_pkey PRIMARY KEY (id)
);

CREATE TABLE collections_tasks (
  organization_id text NOT NULL,
  collection_id text NOT NULL,
  task_id text REFERENCES tasks (id),
  submissions_needed integer,
  CONSTRAINT collections_tasks_pkey PRIMARY KEY (organization_id, collection_id, task_id),
  FOREIGN KEY (organization_id, collection_id) REFERENCES collections (organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE items (
  organization_id text NOT NULL,
  id text NOT NULL,
  collection_id text NOT NULL,
  data jsonb NOT NULL,
  FOREIGN KEY (organization_id, collection_id) REFERENCES collections (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT items_pkey PRIMARY KEY (organization_id, id)
);

CREATE TABLE submissions (
  organization_id text NOT NULL,
  item_id text NOT NULL,
  task_id text NOT NULL,
  user_id integer NOT NULL,
  step text NOT NULL DEFAULT 'default',
  step_index integer NOT NULL DEFAULT 0,
  skipped boolean NOT NULL DEFAULT FALSE,
  date_created timestamp with time zone DEFAULT timezone('UTC'::text, now()),
  date_modified timestamp with time zone DEFAULT timezone('UTC'::text, now()),
  data jsonb,
  client jsonb,
  CONSTRAINT submissions_pkey PRIMARY KEY (organization_id, item_id, user_id, task_id, step),
  CONSTRAINT data_or_skipped CHECK ((skipped = FALSE AND data IS NOT NULL) OR (skipped = TRUE AND data IS NULL)),

  FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, item_id) REFERENCES items (organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX submissions_skipped_user_id ON submissions (skipped, user_id);
CREATE INDEX submissions_user_id_organization_id_step_index ON submissions (user_id, organization_id, item_id, step_index);

CREATE TABLE submission_counts (
  organization_id text NOT NULL,
  item_id text NOT NULL,
  task_id text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  CONSTRAINT submission_counts_pkey PRIMARY KEY (organization_id, item_id, task_id)
);

CREATE OR REPLACE FUNCTION update_submission_counts()
RETURNS TRIGGER
AS $$
DECLARE
  _organization_id text;
  _item_id text;
  _task_id text;
  _count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _organization_id := NEW.organization_id;
    _item_id := NEW.item_id;
    _task_id := NEW.task_id;
  ELSIF TG_OP = 'UPDATE' THEN
    _organization_id := NEW.organization_id;
    _item_id := NEW.item_id;
    _task_id := NEW.task_id;
  ELSIF TG_OP = 'DELETE' THEN
    _organization_id := OLD.organization_id;
    _item_id := OLD.item_id;
    _task_id := OLD.task_id;
  END IF;

  SELECT COUNT(*)
  INTO _count
  FROM submissions
  WHERE
    skipped = FALSE AND
    organization_id = _organization_id AND
    item_id = _item_id AND
    task_id = _task_id;

  INSERT INTO submission_counts (organization_id, item_id, task_id, count)
      VALUES (_organization_id, _item_id, _task_id, _count)
    ON CONFLICT (organization_id, item_id, task_id)
    DO UPDATE SET
      count = EXCLUDED.count;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION truncate_submission_counts()
RETURNS TRIGGER
AS $$
BEGIN
  TRUNCATE submission_counts;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_submissions_trg
  AFTER INSERT OR UPDATE OR DELETE
  ON submissions
  FOR EACH ROW
  EXECUTE PROCEDURE update_submission_counts();

CREATE TRIGGER truncate_submissions_trg
  AFTER TRUNCATE
  ON submissions
  FOR EACH STATEMENT
  EXECUTE PROCEDURE truncate_submission_counts();
