/** Retry transient asset failures; vary the URL to bypass a cached failed response. */
export async function retryAssetLoad<T>(url: string, load: (url: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await load(attempt === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}retry=${Date.now()}-${attempt}`);
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
}
