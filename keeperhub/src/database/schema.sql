-- Core plugins table
CREATE TABLE IF NOT EXISTS plugins (
    plugin_type TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT DEFAULT 'Integration',
    icon_name TEXT,
    single_connection INTEGER DEFAULT 0,
    has_credentials INTEGER DEFAULT 0,
    form_fields TEXT,  -- JSON array of credential fields
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Plugin steps (actions) table
CREATE TABLE IF NOT EXISTS plugin_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plugin_type TEXT NOT NULL,
    step_slug TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    step_function TEXT NOT NULL,
    step_import_path TEXT NOT NULL,
    config_fields TEXT NOT NULL,  -- JSON array of input fields
    output_fields TEXT NOT NULL,  -- JSON array of output fields
    UNIQUE(plugin_type, step_slug),
    FOREIGN KEY (plugin_type) REFERENCES plugins(plugin_type) ON DELETE CASCADE
);

-- Full-text search index for plugin discovery
CREATE VIRTUAL TABLE IF NOT EXISTS plugins_fts USING fts5(
    plugin_type,
    label,
    description,
    category
);

-- Full-text search index for step discovery
CREATE VIRTUAL TABLE IF NOT EXISTS steps_fts USING fts5(
    plugin_type,
    step_slug,
    label,
    description,
    category
);

-- Workflow templates table
CREATE TABLE IF NOT EXISTS workflow_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    use_case TEXT NOT NULL,
    difficulty TEXT DEFAULT 'beginner',  -- beginner, intermediate, advanced
    tags TEXT,  -- JSON array of tags
    nodes TEXT NOT NULL,  -- JSON array of workflow nodes
    edges TEXT NOT NULL,  -- JSON array of workflow edges
    required_plugins TEXT,  -- JSON array of plugin types
    estimated_setup_time INTEGER DEFAULT 5,  -- minutes
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Template search index
CREATE VIRTUAL TABLE IF NOT EXISTS templates_fts USING fts5(
    template_id,
    name,
    description,
    use_case,
    tags
);

-- Triggers to keep FTS indexes in sync
CREATE TRIGGER IF NOT EXISTS plugins_ai AFTER INSERT ON plugins BEGIN
    INSERT INTO plugins_fts(rowid, plugin_type, label, description, category)
    VALUES (new.rowid, new.plugin_type, new.label, new.description, new.category);
END;

CREATE TRIGGER IF NOT EXISTS plugins_ad AFTER DELETE ON plugins BEGIN
    DELETE FROM plugins_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS plugins_au AFTER UPDATE ON plugins BEGIN
    UPDATE plugins_fts SET
        plugin_type = new.plugin_type,
        label = new.label,
        description = new.description,
        category = new.category
    WHERE rowid = new.rowid;
END;

CREATE TRIGGER IF NOT EXISTS steps_ai AFTER INSERT ON plugin_steps BEGIN
    INSERT INTO steps_fts(rowid, plugin_type, step_slug, label, description, category)
    VALUES (new.id, new.plugin_type, new.step_slug, new.label, new.description, new.category);
END;

CREATE TRIGGER IF NOT EXISTS steps_ad AFTER DELETE ON plugin_steps BEGIN
    DELETE FROM steps_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS steps_au AFTER UPDATE ON plugin_steps BEGIN
    UPDATE steps_fts SET
        plugin_type = new.plugin_type,
        step_slug = new.step_slug,
        label = new.label,
        description = new.description,
        category = new.category
    WHERE rowid = new.id;
END;

CREATE TRIGGER IF NOT EXISTS templates_ai AFTER INSERT ON workflow_templates BEGIN
    INSERT INTO templates_fts(rowid, template_id, name, description, use_case, tags)
    VALUES (new.rowid, new.id, new.name, new.description, new.use_case, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS templates_ad AFTER DELETE ON workflow_templates BEGIN
    DELETE FROM templates_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS templates_au AFTER UPDATE ON workflow_templates BEGIN
    UPDATE templates_fts SET
        template_id = new.id,
        name = new.name,
        description = new.description,
        use_case = new.use_case,
        tags = new.tags
    WHERE rowid = new.rowid;
END;
