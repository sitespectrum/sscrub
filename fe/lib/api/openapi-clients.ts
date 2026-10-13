import createFetchClient, { Middleware } from "openapi-fetch";
import createQueryClient from "openapi-react-query";
import { API_URL } from "../constants";
import { paths } from "./sscrub-api-schema";

let refreshPromise: Promise<string | null> | null = null;

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = localStorage.getItem("token");
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },

  async onResponse({ request, response, options }) {
    if (response.status !== 401) {
      return response;
    }

    if (request.url.includes("/api/auth/refresh")) {
      return response;
    }

    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) {
      return response;
    }

    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          const res = await fetch(`${options.baseUrl}/api/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
          });

          if (res.ok) {
            const data = await res.json();
            localStorage.saveItem("token", data.token);
            localStorage.saveItem("refreshToken", data.refreshToken);
            return data.token;
          }

          localStorage.deleteItem("token");
          localStorage.deleteItem("refreshToken");
          return null;
        } catch {
          return null;
        } finally {
          refreshPromise = null;
        }
      })();
    }

    const newToken = await refreshPromise;

    if (newToken) {
      const newRequest = request.clone();
      newRequest.headers.set("Authorization", `Bearer ${newToken}`);
      return fetch(newRequest);
      //TODO: on for sure invalid token redirect
    }

    return response;
  },
};

export const fetchClient = createFetchClient<paths>({
  baseUrl: API_URL,
});
fetchClient.use(authMiddleware);

export const $api = createQueryClient(fetchClient);
