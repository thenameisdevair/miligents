#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { createDatabaseAdapter } from '../src/database/database-adapter.js';
import { PluginRepository } from '../src/database/plugin-repository.js';
import { TemplateRepository } from '../src/database/template-repository.js';
import { PluginLoader } from '../src/indexer/plugin-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('Building plugin index...');

  const dbPath = path.join(__dirname, '../plugins.db');
  const keeperhubPluginsPath = path.join(
    __dirname,
    '../../keeperhub/keeperhub/plugins'
  );
  const templatesPath = path.join(__dirname, '../src/templates');

  try {
    await fs.unlink(dbPath);
    console.log('Removed existing database');
  } catch (error) {
    // Database doesn't exist yet
  }

  const db = await createDatabaseAdapter(dbPath);
  const pluginRepo = new PluginRepository(db);
  const templateRepo = new TemplateRepository(db);

  console.log(`Loading plugins from ${keeperhubPluginsPath}...`);
  const pluginLoader = new PluginLoader(keeperhubPluginsPath);
  const plugins = await pluginLoader.loadAllPlugins();

  console.log(`Found ${plugins.length} plugins`);

  let totalSteps = 0;
  for (const plugin of plugins) {
    console.log(`Indexing plugin: ${plugin.label} (${plugin.type})`);

    const category = getCategoryForPlugin(plugin.type);

    pluginRepo.insertPlugin({
      pluginType: plugin.type,
      label: plugin.label,
      description: plugin.description,
      category,
      iconName: plugin.type,
      singleConnection: plugin.singleConnection || false,
      hasCredentials:
        plugin.formFields && plugin.formFields.length > 0 ? true : false,
      formFields: plugin.formFields || [],
    });

    for (const action of plugin.actions) {
      pluginRepo.insertStep({
        pluginType: plugin.type,
        stepSlug: action.slug,
        label: action.label,
        description: action.description,
        category: action.category,
        stepFunction: action.stepFunction,
        stepImportPath: action.stepImportPath,
        configFields: action.configFields,
        outputFields: action.outputFields,
      });
      totalSteps++;
    }
  }

  console.log(`Indexed ${totalSteps} plugin steps`);

  console.log(`Loading templates from ${templatesPath}...`);
  const templateFiles = await fs.readdir(templatesPath);
  const jsonFiles = templateFiles.filter((f) => f.endsWith('.json'));

  for (const file of jsonFiles) {
    const templatePath = path.join(templatesPath, file);
    const content = await fs.readFile(templatePath, 'utf-8');
    const template = JSON.parse(content);

    console.log(`Indexing template: ${template.name} (${template.id})`);

    templateRepo.insertTemplate(template);
  }

  console.log(`Indexed ${jsonFiles.length} templates`);

  db.close();

  console.log('Plugin index built successfully!');
  console.log(`Database: ${dbPath}`);
}

function getCategoryForPlugin(pluginType: string): string {
  switch (pluginType) {
    case 'web3':
      return 'Web3';
    case 'discord':
      return 'Messaging';
    case 'sendgrid':
      return 'Notification';
    case 'webhook':
      return 'Integration';
    default:
      return 'Integration';
  }
}

main().catch((error) => {
  console.error('Failed to build index:', error);
  process.exit(1);
});
