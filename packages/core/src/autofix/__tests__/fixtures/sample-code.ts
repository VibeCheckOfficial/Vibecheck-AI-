/**
 * Sample code fixtures for testing fix modules
 */

// Silent failure patterns
export const emptyCatchBlock = `
try {
  processOrder();
} catch (e) {
  // TODO: ignore for now
}
showSuccess();
`;

export const emptyCatchBlockFixed = `
try {
  processOrder();
  showSuccess();
} catch (error) {
  console.error('Operation failed:', error);
  showError("Unable to process order. Please try again.");
}
`;

export const logOnlyCatch = `
async function fetchData() {
  try {
    const response = await fetch('/api/data');
    return response.json();
  } catch (err) {
    console.log('Error fetching data:', err);
  }
}
`;

export const emptyPromiseCatch = `
fetchUserData()
  .then(data => setUser(data))
  .catch(() => {});
`;

// Auth gap patterns
export const expressRouteNoAuth = `
import express from 'express';

const router = express.Router();

router.get('/admin/users', (req, res) => {
  return res.json(getUsers());
});

export default router;
`;

export const expressRouteWithAuth = `
import express from 'express';
import { requireAuth } from './middleware/auth.js';

const router = express.Router();

router.get('/admin/users', requireAuth, (req, res) => {
  return res.json(getUsers());
});

export default router;
`;

// Env var patterns
export const undefinedEnvVar = `
const apiKey = process.env.API_KEY;
const client = new ApiClient(apiKey);
`;

export const envVarWithCheck = `
const apiKey = process.env.API_KEY;
if (!apiKey) {
  throw new Error('API_KEY environment variable is required');
}
const client = new ApiClient(apiKey);
`;

// Ghost route patterns
export const uiWithMissingRoute = `
import { Link } from 'react-router-dom';

export function Navigation() {
  return (
    <nav>
      <Link to="/dashboard">Dashboard</Link>
      <Link to="/settings">Settings</Link>
      <Link to="/admin/reports">Reports</Link>
    </nav>
  );
}
`;

export const fetchToMissingEndpoint = `
async function getReports() {
  const response = await fetch('/api/reports');
  if (!response.ok) throw new Error('Failed to fetch reports');
  return response.json();
}
`;
