/**
 * Quick D1 Connection Test
 * Run this with: npx wrangler d1 execute rental-saas-db --command="SELECT name FROM sqlite_master WHERE type='table'" --remote
 */

// Test if the database is accessible and has tables
const testQuery = `
  SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
`;

console.log("Run this command to test your D1 connection:");
console.log('npx wrangler d1 execute rental-saas-db --command="SELECT name FROM sqlite_master WHERE type=\'table\'" --remote');
console.log("");
console.log("Expected output should include tables like: apartments, expenses, owners, payments, units, etc.");
