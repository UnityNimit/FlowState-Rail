const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8002';
const TOKEN_KEY = 'flowstate_workspace_token';
const META_KEY = 'flowstate_workspace_meta';

class ApiService {
  constructor() { this.token = localStorage.getItem(TOKEN_KEY); }
  async ensureWorkspace() {
    const cached = JSON.parse(localStorage.getItem(META_KEY) || 'null');
    if (this.token && cached?.expiresAt && new Date(cached.expiresAt) > new Date()) return cached;
    const response = await fetch(`${API_URL}/api/v1/workspaces/anonymous`, { method: 'POST' });
    if (!response.ok) throw new Error('Unable to create an isolated demo workspace');
    const workspace = await response.json();
    this.token = workspace.token;
    localStorage.setItem(TOKEN_KEY, workspace.token);
    localStorage.setItem(META_KEY, JSON.stringify(workspace));
    return workspace;
  }
  headers(extra = {}) { return { 'X-Workspace-Token': this.token, ...extra }; }
  async request(path, options = {}) {
    await this.ensureWorkspace();
    const response = await fetch(`${API_URL}${path}`, { ...options, headers: this.headers(options.headers) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || `Request failed (${response.status})`);
    return payload;
  }
  get(path) { return this.request(path); }
  post(path, body) { return this.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); }
  upload(source, file) { const form = new FormData(); form.append('file', file); return this.request(`/api/v1/imports/${source}`, { method: 'POST', body: form }); }
  templateUrl(source) { return `${API_URL}/api/v1/templates/${source}`; }
}
const apiService = new ApiService();
export { API_URL };
export default apiService;
