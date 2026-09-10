import type { ToolElicitationRequest, ToolElicitationResult } from '@drawloom/tools';

export function elicitationContent(params: ToolElicitationRequest['params'], form: FormData): NonNullable<ToolElicitationResult['content']> {
  const entries: [string, string | number | boolean | string[]][] = [];
  for (const [name, field] of Object.entries(params.requestedSchema.properties)) {
    const raw = form.get(name), required = params.requestedSchema.required?.includes(name);
    if (field.type === 'boolean') entries.push([name, raw === 'on']);
    else if (field.type === 'array') {
      const values = form.getAll(name).map(value => { if (typeof value !== 'string') throw Error('Expected a choice'); return value; });
      if (values.length || required) entries.push([name, values]);
    } else {
      if ((raw === null || raw === '') && !required) continue;
      if (typeof raw !== 'string') throw Error('Complete the requested information');
      if (field.type === 'number' || field.type === 'integer') {
        if (!raw.trim() || !Number.isFinite(Number(raw))) throw Error('Enter a valid number');
        entries.push([name, Number(raw)]);
      } else entries.push([name, raw]);
    }
  }
  return Object.fromEntries(entries);
}
