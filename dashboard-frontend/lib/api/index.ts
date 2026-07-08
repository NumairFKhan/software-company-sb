/**
 * Public barrel export for the API layer.
 */
export { API_BASE_URL, getWsBaseUrl, ApiError, apiFetch } from './client';
export {
  getProjects,
  getProject,
  getProjectTokenUsage,
  postApprovalDecision,
} from './projects';
