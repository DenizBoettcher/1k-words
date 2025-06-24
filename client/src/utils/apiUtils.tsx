// simpler retrieval
export const ApiUrl = process.env.APP_API_URL;

export function getAuthHeader(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function RequestApi(segments: string, requestInit: RequestInit = {}): Promise<Response> {
  try {
    const res = await fetch(`${ApiUrl}/api/${segments}`, {
      ...requestInit,
      headers: {
        ...requestInit.headers,
        ...getAuthHeader(),
      }
    });

    if (!res.ok) {
      console.log(`Error: ${await res.text()}`)
    }

    return res;
  } catch (e) {
    if (e instanceof TypeError) {
      console.error(`Network error: ${e.message}`);
    } else {
      console.error("Unexpected error:", e);
    }
    throw e;
  }
}