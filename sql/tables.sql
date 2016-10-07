CREATE TABLE collections (
  provider text NOT NULL,
  id text NOT NULL,
  tasks text[] NOT NULL,
  title text,
  url text,
  submissions_needed integer DEFAULT -1,
  data jsonb,
  CONSTRAINT collections_pkey PRIMARY KEY (provider, id)
);

CREATE INDEX collections_tasks ON collections USING GIN(tasks);

CREATE TABLE items (
  provider text NOT NULL,
  id text NOT NULL,
  collection_id text NOT NULL,
  data jsonb NOT NULL,
  FOREIGN KEY (provider, collection_id) REFERENCES collections (provider, id) ON DELETE CASCADE,
  CONSTRAINT items_pkey PRIMARY KEY (provider, id)
);

CREATE TABLE submissions (
  item_provider text NOT NULL,
  item_id text NOT NULL,
  task text NOT NULL,
  user_id integer NOT NULL,
  step text NOT NULL DEFAULT 'default',
  step_index integer NOT NULL DEFAULT 0,
  skipped boolean NOT NULL DEFAULT FALSE,
  date_created timestamp with time zone DEFAULT timezone('UTC'::text, now()),
  date_modified timestamp with time zone DEFAULT timezone('UTC'::text, now()),
  data jsonb,
  client jsonb,
  CONSTRAINT submissions_pkey PRIMARY KEY (item_provider, item_id, user_id, task, step),
  CONSTRAINT data_or_skipped CHECK ((skipped = FALSE AND data IS NOT NULL) OR (skipped = TRUE AND data IS NULL)),
  FOREIGN KEY (item_provider, item_id) REFERENCES items (provider, id) ON DELETE RESTRICT
);

CREATE INDEX submissions_skipped_user_id ON submissions (skipped, user_id);
CREATE INDEX submissions_user_id_provider_id_step_index ON submissions (user_id, item_provider, item_id, step_index);

CREATE TABLE submission_counts (
  item_provider text NOT NULL,
  item_id text NOT NULL,
  task text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  CONSTRAINT submission_counts_pkey PRIMARY KEY (item_provider, item_id, task)
);

CREATE OR REPLACE FUNCTION update_submission_counts()
RETURNS TRIGGER
AS $$
DECLARE
  _item_provider text;
  _item_id text;
  _task text;
  _count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _item_provider := NEW.item_provider;
    _item_id := NEW.item_id;
    _task := NEW.task;
  ELSIF TG_OP = 'UPDATE' THEN
    _item_provider := NEW.item_provider;
    _item_id := NEW.item_id;
    _task := NEW.task;
  ELSIF TG_OP = 'DELETE' THEN
    _item_provider := OLD.item_provider;
    _item_id := OLD.item_id;
    _task := OLD.task;
  END IF;

  SELECT COUNT(*)
  INTO _count
  FROM submissions
  WHERE
    skipped = FALSE AND
    item_provider = _item_provider AND
    item_id = _item_id AND
    task = _task;

  INSERT INTO submission_counts (item_provider, item_id, task, count)
      VALUES (_item_provider, _item_id, _task, _count)
    ON CONFLICT (item_provider, item_id, task)
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
