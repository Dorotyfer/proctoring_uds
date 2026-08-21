export function parseJson(value) {
  if (value == null || typeof value === 'object') {
    return value;
  }

  return JSON.parse(value);
}

export function toIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Expected a valid date');
  }

  return date.toISOString();
}

export function toMysqlDate(value) {
  return toIsoDate(value).slice(0, -1).replace('T', ' ');
}
