export function createResilientObjectStorage(storage, options = {}) {
  const maxAttempts = options.maxAttempts ?? 3;
  const delay = options.delay ?? defaultDelay;

  async function run(method, args) {
    let attempt = 1;
    while (attempt <= maxAttempts) {
      try {
        return await storage[method](...args);
      } catch (error) {
        if (attempt === maxAttempts || !isRetryable(error)) {
          throw error;
        }
        await delay(100 * (2 ** (attempt - 1)));
        attempt += 1;
      }
    }
  }

  return {
    delete(...args) {
      return run('delete', args);
    },
    get(...args) {
      return run('get', args);
    },
    put(...args) {
      return run('put', args);
    }
  };
}

function isRetryable(error) {
  if (error?.$retryable) {
    return true;
  }
  const statusCode = error?.$metadata?.httpStatusCode;
  if (statusCode === undefined) {
    return true;
  }
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

function defaultDelay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
