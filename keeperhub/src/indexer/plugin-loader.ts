import { promises as fs } from 'fs';
import path from 'path';

export interface LoadedPlugin {
  type: string;
  label: string;
  description: string;
  icon?: any;
  singleConnection?: boolean;
  formFields?: any[];
  actions: LoadedAction[];
}

export interface LoadedAction {
  slug: string;
  label: string;
  description: string;
  category: string;
  stepFunction: string;
  stepImportPath: string;
  configFields: any[];
  outputFields: any[];
}

export class PluginLoader {
  constructor(private pluginsPath: string) {}

  async loadAllPlugins(): Promise<LoadedPlugin[]> {
    const plugins: LoadedPlugin[] = [];

    const entries = await fs.readdir(this.pluginsPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'index.ts') {
        const pluginPath = path.join(this.pluginsPath, entry.name, 'index.ts');

        try {
          const exists = await fs
            .access(pluginPath)
            .then(() => true)
            .catch(() => false);

          if (exists) {
            const plugin = await this.loadPlugin(pluginPath);
            if (plugin) {
              plugins.push(plugin);
            }
          }
        } catch (error) {
          console.error(`Failed to load plugin ${entry.name}:`, error);
        }
      }
    }

    return plugins;
  }

  private async loadPlugin(pluginPath: string): Promise<LoadedPlugin | null> {
    try {
      const content = await fs.readFile(pluginPath, 'utf-8');

      const plugin: any = {};

      const typeMatch = content.match(/type:\s*["']([^"']+)["']/);
      if (typeMatch) plugin.type = typeMatch[1];

      const labelMatch = content.match(/label:\s*["']([^"']+)["']/);
      if (labelMatch) plugin.label = labelMatch[1];

      const descMatch = content.match(/description:\s*["']([^"']+)["']/);
      if (descMatch) plugin.description = descMatch[1];

      const singleConnMatch = content.match(
        /singleConnection:\s*(true|false)/
      );
      if (singleConnMatch)
        plugin.singleConnection = singleConnMatch[1] === 'true';

      plugin.formFields = this.extractFormFields(content);

      plugin.actions = this.extractActionsImproved(content);

      if (!plugin.type || !plugin.label || !plugin.description) {
        console.warn(`Incomplete plugin definition in ${pluginPath}`);
        return null;
      }

      return plugin as LoadedPlugin;
    } catch (error) {
      console.error(`Error loading plugin from ${pluginPath}:`, error);
      return null;
    }
  }

  private extractFormFields(content: string): any[] {
    const fields: any[] = [];

    const formFieldsMatch = content.match(/formFields:\s*\[([\s\S]*?)\]/);
    if (!formFieldsMatch) return fields;

    const formFieldsContent = formFieldsMatch[1];

    const fieldMatches = formFieldsContent.matchAll(
      /\{[\s\S]*?id:\s*["']([^"']+)["'][\s\S]*?label:\s*["']([^"']+)["'][\s\S]*?type:\s*["']([^"']+)["'][\s\S]*?\}/g
    );

    for (const match of fieldMatches) {
      const field: any = {
        id: match[1],
        label: match[2],
        type: match[3],
      };

      const fullMatch = match[0];
      const placeholderMatch = fullMatch.match(/placeholder:\s*["']([^"']+)["']/);
      if (placeholderMatch) field.placeholder = placeholderMatch[1];

      const helpTextMatch = fullMatch.match(/helpText:\s*["']([^"']+)["']/);
      if (helpTextMatch) field.helpText = helpTextMatch[1];

      const requiredMatch = fullMatch.match(/required:\s*(true|false)/);
      field.required = requiredMatch ? requiredMatch[1] === 'true' : false;

      fields.push(field);
    }

    return fields;
  }

  private extractActionsImproved(content: string): LoadedAction[] {
    const actions: LoadedAction[] = [];

    const actionsStartIndex = content.indexOf('actions: [');
    if (actionsStartIndex === -1) return actions;

    let braceCount = 0;
    let actionStart = -1;
    let inAction = false;

    for (let i = actionsStartIndex + 10; i < content.length; i++) {
      const char = content[i];

      if (char === '{') {
        if (braceCount === 0) {
          actionStart = i;
          inAction = true;
        }
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && inAction) {
          const actionContent = content.substring(actionStart, i + 1);
          const action = this.parseAction(actionContent);
          if (action) {
            actions.push(action);
          }
          inAction = false;
        }
      } else if (char === ']' && braceCount === 0) {
        break;
      }
    }

    return actions;
  }

  private parseAction(actionContent: string): LoadedAction | null {
    const slug = this.extractValue(actionContent, 'slug');
    const label = this.extractValue(actionContent, 'label');
    const description = this.extractValue(actionContent, 'description');
    const category = this.extractValue(actionContent, 'category');
    const stepFunction = this.extractValue(actionContent, 'stepFunction');
    const stepImportPath = this.extractValue(actionContent, 'stepImportPath');

    if (!slug || !label || !description || !category || !stepFunction || !stepImportPath) {
      return null;
    }

    const outputFields = this.extractFieldsFromSection(actionContent, 'outputFields');
    const configFields = this.extractFieldsFromSection(actionContent, 'configFields');

    return {
      slug,
      label,
      description,
      category,
      stepFunction,
      stepImportPath,
      outputFields,
      configFields,
    };
  }

  private extractValue(content: string, key: string): string | null {
    const regex = new RegExp(`${key}:\\s*["']([^"']+)["']`);
    const match = content.match(regex);
    return match ? match[1] : null;
  }

  private extractFieldsFromSection(content: string, sectionName: string): any[] {
    const fields: any[] = [];
    const sectionRegex = new RegExp(`${sectionName}:\\s*\\[([\\s\\S]*?)\\]`);
    const sectionMatch = content.match(sectionRegex);

    if (!sectionMatch) return fields;

    const sectionContent = sectionMatch[1];
    let braceCount = 0;
    let fieldStart = -1;
    let inField = false;

    for (let i = 0; i < sectionContent.length; i++) {
      const char = sectionContent[i];

      if (char === '{') {
        if (braceCount === 0) {
          fieldStart = i;
          inField = true;
        }
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && inField) {
          const fieldContent = sectionContent.substring(fieldStart, i + 1);
          const field = this.parseField(fieldContent, sectionName);
          if (field) {
            fields.push(field);
          }
          inField = false;
        }
      }
    }

    return fields;
  }

  private parseField(fieldContent: string, sectionName: string): any | null {
    if (sectionName === 'outputFields') {
      const field = this.extractValue(fieldContent, 'field');
      const description = this.extractValue(fieldContent, 'description');

      if (!field || !description) return null;

      return { field, description };
    } else {
      const key = this.extractValue(fieldContent, 'key');
      const label = this.extractValue(fieldContent, 'label');
      const type = this.extractValue(fieldContent, 'type');

      if (!key || !label || !type) return null;

      const field: any = { key, label, type };

      const placeholder = this.extractValue(fieldContent, 'placeholder');
      if (placeholder) field.placeholder = placeholder;

      const example = this.extractValue(fieldContent, 'example');
      if (example) field.example = example;

      const requiredMatch = fieldContent.match(/required:\s*(true|false)/);
      field.required = requiredMatch ? requiredMatch[1] === 'true' : false;

      const rowsMatch = fieldContent.match(/rows:\s*(\d+)/);
      if (rowsMatch) field.rows = parseInt(rowsMatch[1], 10);

      const chainTypeFilter = this.extractValue(fieldContent, 'chainTypeFilter');
      if (chainTypeFilter) field.chainTypeFilter = chainTypeFilter;

      const networkField = this.extractValue(fieldContent, 'networkField');
      if (networkField) field.networkField = networkField;

      return field;
    }
  }
}
