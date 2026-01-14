/**
 * URL Utilities
 *
 * Utility functions for normalizing and validating URLs.
 * Used to ensure all URLs stored in the system are absolute and valid.
 */

/**
 * Normalizes a URL by converting relative URLs to absolute URLs.
 *
 * @param url - The URL to normalize (can be relative or absolute)
 * @param sourceUrl - The source URL to use as base for relative URLs
 * @returns Normalized absolute URL
 *
 * @example
 * normalizeUrl('/biz/example', 'https://www.yelp.com/search')
 * // Returns: 'https://www.yelp.com/biz/example'
 *
 * @example
 * normalizeUrl('https://example.com', 'https://source.com')
 * // Returns: 'https://example.com' (unchanged)
 */
export function normalizeUrl(url: string, sourceUrl: string): string {
  // Handle empty or invalid input
  if (!url || typeof url !== 'string') {
    return '';
  }

  // Trim whitespace
  url = url.trim();
  sourceUrl = sourceUrl.trim();

  // If already absolute (starts with http:// or https://), return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  try {
    // Parse source URL to get origin
    const sourceUrlObj = new URL(sourceUrl);

    // Handle protocol-relative URLs (//example.com)
    if (url.startsWith('//')) {
      return `${sourceUrlObj.protocol}${url}`;
    }

    // Handle relative paths starting with /
    if (url.startsWith('/')) {
      return `${sourceUrlObj.origin}${url}`;
    }

    // Handle relative paths without leading slash
    // Treat as path relative to source URL
    return new URL(url, sourceUrl).href;
  } catch (error) {
    // If normalization fails, log error and return empty string
    console.error(`Failed to normalize URL: ${url} with source: ${sourceUrl}`, error);
    return '';
  }
}

/**
 * Checks if a URL is valid and absolute.
 *
 * @param url - The URL to validate
 * @returns true if URL is valid and absolute (starts with http:// or https://)
 *
 * @example
 * isValidUrl('https://example.com') // Returns: true
 * isValidUrl('/relative/path') // Returns: false
 * isValidUrl('') // Returns: false
 */
export function isValidUrl(url: string | undefined | null): boolean {
  // Handle empty, null, or undefined input
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Trim whitespace
  url = url.trim();

  // Check if it's an absolute URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false;
  }

  // Try to parse URL to validate format
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
