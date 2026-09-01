import axios from "axios";

// Same-origin by default: the Cloudflare Pages Functions are served from the
// same domain as the frontend (e.g. https://rental-saas.pages.dev/api/...),
// so `/api` works for every deployment. Override with REACT_APP_API_BASE_URL
// only if the API lives on a different host (e.g. a local backend during dev).
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "/api";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("owner");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
