export function titleize(value: string): string {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

export function titleForDoc(slug: string, fallback = 'Documentation'): string {
  if (!slug || slug === 'README') {
    return fallback;
  }

  return titleize(slug);
}
